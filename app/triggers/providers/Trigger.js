const Component = require('../../registry/Component');
const event = require('../../event');
const { getTriggerCounter } = require('../../prometheus/trigger');
const { fullName } = require('../../model/container');

/**
 * Render body or title simple template.
 * @param template
 * @param container
 * @returns {*}
 */
function renderSimple(template, container) {
    let value = template;
    value = value.replace(/\${\s*id\s*}/g, container.id ? container.id : '');
    value = value.replace(/\${\s*name\s*}/g, container.name ? container.name : '');
    value = value.replace(/\${\s*controller\s*}/g, container.controller ? container.controller : '');
    value = value.replace(/\${\s*kind\s*}/g, container.updateKind && container.updateKind.kind ? container.updateKind.kind : '');
    value = value.replace(/\${\s*semver\s*}/g, container.updateKind && container.updateKind.semverDiff ? container.updateKind.semverDiff : '');
    value = value.replace(/\${\s*local\s*}/g, container.updateKind && container.updateKind.localValue ? container.updateKind.localValue : '');
    value = value.replace(/\${\s*remote\s*}/g, container.updateKind && container.updateKind.remoteValue ? container.updateKind.remoteValue : '');
    value = value.replace(/\${\s*link\s*}/g, container.result && container.result.link ? container.result.link : '');
    return value;
}

/**
 * Trigger base component.
 */
class Trigger extends Component {
    /**
     * Handle container report (simple mode).
     * @param containerReport
     * @returns {Promise<void>}
     */
    async handleContainerReport(containerReport) {
        // Filter on changed containers with update available and passing trigger threshold
        if (
            (containerReport.changed || !this.configuration.once)
            && containerReport.container.updateAvailable
        ) {
            const logContainer = this
                .log.child({ container: fullName(containerReport.container) }) || this.log;
            let status = 'error';
            try {
                if (!this.isThresholdReached(containerReport.container)) {
                    logContainer.debug('Threshold not reached => do not trigger');
                } else {
                    logContainer.debug('Run trigger');
                    await this.trigger(containerReport.container);
                }
                status = 'success';
            } catch (e) {
                logContainer.warn(`Error (${e.message})`);
                logContainer.debug(e);
            } finally {
                getTriggerCounter().inc({ type: this.type, name: this.name, status });
            }
        }
    }

    /**
     * Handle container reports (batch mode).
     * @param containerReports
     * @returns {Promise<void>}
     */
    async handleContainerReports(containerReports) {
        // Filter on containers with update available and passing trigger threshold
        try {
            const containerReportsFiltered = containerReports
                .filter((containerReport) => containerReport.changed || !this.configuration.once)
                .filter((containerReport) => containerReport.container.updateAvailable)
                .filter((containerReport) => this.isThresholdReached(containerReport.container));
            const containersFiltered = containerReportsFiltered
                .map((containerReport) => containerReport.container);
            if (containersFiltered.length > 0) {
                this.log.debug('Run trigger batch');
                await this.triggerBatch(containersFiltered);
            }
        } catch (e) {
            this.log.warn(`Error (${e.message})`);
            this.log.debug(e);
        }
    }

    /**
     * Return true if update reaches trigger threshold.
     * @param containerResult
     * @returns {boolean}
     */
    isThresholdReached(containerResult) {
        let thresholdPassing = true;
        if (
            this.configuration.threshold.toLowerCase() !== 'all'
            && containerResult.updateKind
            && containerResult.updateKind.kind === 'tag'
            && containerResult.updateKind.semverDiff
            && containerResult.updateKind.semverDiff !== 'unknown'
        ) {
            const threshold = this.configuration.threshold.toLowerCase();
            switch (threshold) {
            case 'minor':
                thresholdPassing = containerResult.updateKind.semverDiff !== 'major';
                break;
            case 'patch':
                thresholdPassing = containerResult.updateKind.semverDiff !== 'major'
                        && containerResult.updateKind.semverDiff !== 'minor';
                break;
            default:
                thresholdPassing = true;
            }
        }
        return thresholdPassing;
    }

    /**
     * Init the Trigger.
     */
    async init() {
        await this.initTrigger();
        if (this.configuration.mode.toLowerCase() === 'simple') {
            this.log.debug('Configure "simple" mode');
            event.registerContainerReport(
                async (containerReport) => this.handleContainerReport(containerReport),
            );
        }
        if (this.configuration.mode.toLowerCase() === 'batch') {
            this.log.debug('Configure "batch" mode');
            event.registerContainerReports(
                async (containersReports) => this.handleContainerReports(containersReports),
            );
        }
    }

    /**
     * Override method to merge with common Trigger options (threshold...).
     * @param configuration
     * @returns {*}
     */
    validateConfiguration(configuration) {
        const schema = this.getConfigurationSchema();
        const schemaWithDefaultOptions = schema.append({
            threshold: this.joi
                .string()
                .insensitive()
                .valid('all', 'major', 'minor', 'patch')
                .default('all'),
            mode: this.joi
                .string()
                .insensitive()
                .valid('simple', 'batch')
                .default('simple'),
            once: this.joi
                .boolean()
                .default(true),
            simpletitle: this.joi
                .string()
                // eslint-disable-next-line no-template-curly-in-string
                .default('New ${kind} found for container ${name}'),
            simplebody: this.joi
                .string()
                // eslint-disable-next-line no-template-curly-in-string
                .default('Container ${name} running with ${kind} ${local} can be updated to ${kind} ${remote}\n${link}'),
            batchtitle: this.joi
                .string()
                // eslint-disable-next-line no-template-curly-in-string
                .default('${count} updates available'),
        });
        const schemaValidated = schemaWithDefaultOptions.validate(configuration);
        if (schemaValidated.error) {
            throw schemaValidated.error;
        }
        return schemaValidated.value ? schemaValidated.value : {};
    }

    /**
     * Init Trigger. Can be overridden in trigger implementation class.
     */
    /* eslint-disable-next-line */
    initTrigger() {
        // do nothing by default
    }

    /**
     * Trigger method. Must be overridden in trigger implementation class.
     */
    /* eslint-disable-next-line */
    trigger(containerWithResult) {
        // do nothing by default
        this.log.warn('Cannot trigger container result; this trigger doe not implement "simple" mode');
        return containerWithResult;
    }

    /**
     * Trigger batch method. Must be overridden in trigger implementation class.
     * @param containersWithResult
     * @returns {*}
     */
    /* eslint-disable-next-line */
    triggerBatch(containersWithResult) {
        // do nothing by default
        this.log.warn('Cannot trigger container results; this trigger doe not implement "batch" mode');
        return containersWithResult;
    }

    /**
     * Render trigger title simple.
     * @param container
     * @returns {*}
     */
    renderSimpleTitle(container) {
        return renderSimple(this.configuration.simpletitle, container);
    }

    /**
     * Render trigger body simple.
     * @param container
     * @returns {*}
     */
    renderSimpleBody(container) {
        return renderSimple(this.configuration.simplebody, container);
    }

    /**
     * Render trigger title batch.
     * @param containers
     * @returns {*}
     */
    renderBatchTitle(containers) {
        let title = this.configuration.batchtitle;
        title = title.replace(/\$\{\s*count\s*\}/g, containers.length);
        return title;
    }

    /**
     * Render trigger body batch.
     * @param containers
     * @returns {*}
     */
    renderBatchBody(containers) {
        return containers.map((container) => `- ${this.renderSimpleBody(container)}\n`).join('\n');
    }
}

module.exports = Trigger;

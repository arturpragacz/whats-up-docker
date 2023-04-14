const { ValidationError } = require('joi');
const Docker = require('./Docker');
const log = require('../../../log');

const configurationValid = {
    prune: false,
    dryrun: false,
    threshold: 'all',
    mode: 'simple',
    once: true,
    // eslint-disable-next-line no-template-curly-in-string
    simpletitle: 'New ${kind} found for container ${name}',
    // eslint-disable-next-line no-template-curly-in-string
    simplebody: 'Container ${name} running with ${kind} ${local} can be updated to ${kind} ${remote}\n${link}',
    // eslint-disable-next-line no-template-curly-in-string
    batchtitle: '${count} updates available',
};

const docker = new Docker();
docker.configuration = configurationValid;
docker.log = log;

jest.mock('../../../registry', () => ({
    getState() {
        return {
            controller: {
                'controller.docker.test': {
                    getId: () => 'controller.docker.test',
                    watch: () => Promise.resolve(),
                    dockerApi: {
                        getContainer: (id) => {
                            if (id === '123456789') {
                                return Promise.resolve({
                                    inspect: () => Promise.resolve({
                                        Name: '/container-name',
                                        Id: '123456798',
                                        State: {
                                            Running: true,
                                        },
                                        NetworkSettings: {
                                            Networks: {
                                                test: {
                                                    Aliases: ['9708fc7b44f2', 'test'],
                                                },
                                            },
                                        },
                                    }),
                                    stop: () => Promise.resolve(),
                                    remove: () => Promise.resolve(),
                                    start: () => Promise.resolve(),
                                });
                            }
                            return Promise.reject(new Error('Error when getting container'));
                        },
                        createContainer: (container) => {
                            if (container.name === 'container-name') {
                                return Promise.resolve({
                                    start: () => Promise.resolve(),
                                });
                            }
                            return Promise.reject(new Error('Error when creating container'));
                        },
                        pull: (image) => {
                            if (image === 'test/test:1.2.3' || image === 'my-registry/test/test:4.5.6') {
                                return Promise.resolve();
                            }
                            return Promise.reject(new Error('Error when pulling image'));
                        },
                        getImage: (image) => Promise.resolve({
                            remove: () => {
                                if (image === 'test/test:1.2.3') {
                                    return Promise.resolve();
                                }
                                return Promise.reject(new Error('Error when removing image'));
                            },
                        }),
                        modem: {
                            followProgress: (pullStream, res) => res(),
                        },
                    },
                },
            },
            registry: {
                hub: {
                    getAuthPull: () => undefined,
                    getImageFullName: (image, tagOrDigest) => `${image.registry.url}/${image.name}:${tagOrDigest}`,
                },
            },
        };
    },
}));

beforeEach(() => {
    jest.resetAllMocks();
});

test('validateConfiguration should return validated configuration when valid', () => {
    const validatedConfiguration = docker.validateConfiguration(configurationValid);
    expect(validatedConfiguration).toStrictEqual(configurationValid);
});

test('validateConfiguration should throw error when invalid', () => {
    const configuration = {
        url: 'git://xxx.com',
    };
    expect(() => {
        docker.validateConfiguration(configuration);
    }).toThrowError(ValidationError);
});

test('getController should return controller responsible for a container', () => {
    expect(docker.getController({
        controller: 'test',
    }).getId()).toEqual('controller.docker.test');
});

test('getCurrentContainer should return container from dockerApi', async () => {
    await expect(docker.getCurrentContainer(docker.getController({ controller: 'test' }).dockerApi, {
        id: '123456789',
    })).resolves.not.toBeUndefined();
});

test('getCurrentContainer should throw error when error occurs', async () => {
    await expect(docker.getCurrentContainer(docker.getController({ controller: 'test' }).dockerApi, {
        id: 'unknown',
    })).rejects.toThrowError('Error when getting container');
});

test('inspectContainer should return container details from dockerApi', async () => {
    await expect(docker.inspectContainer({
        inspect: () => (Promise.resolve({})),
    }, log)).resolves.toEqual({});
});

test('inspectContainer should throw error when error occurs', async () => {
    await expect(docker.inspectContainer({
        inspect: () => (Promise.reject(new Error('No container'))),
    }, log)).rejects.toThrowError('No container');
});

test('stopContainer should stop container from dockerApi', async () => {
    await expect(docker.stopContainer({
        stop: () => (Promise.resolve()),
    }, 'name', 'id', log)).resolves.toBeUndefined();
});

test('stopContainer should throw error when error occurs', async () => {
    await expect(docker.stopContainer({
        stop: () => (Promise.reject(new Error('No container'))),
    }, 'name', 'id', log)).rejects.toThrowError('No container');
});

test('removeContainer should stop container from dockerApi', async () => {
    await expect(docker.removeContainer({
        remove: () => (Promise.resolve()),
    }, 'name', 'id', log)).resolves.toBeUndefined();
});

test('removeContainer should throw error when error occurs', async () => {
    await expect(docker.removeContainer({
        remove: () => (Promise.reject(new Error('No container'))),
    }, 'name', 'id', log)).rejects.toThrowError('No container');
});

test('startContainer should stop container from dockerApi', async () => {
    await expect(docker.startContainer({
        start: () => (Promise.resolve()),
    }, 'name', log)).resolves.toBeUndefined();
});

test('startContainer should throw error when error occurs', async () => {
    await expect(docker.startContainer({
        start: () => (Promise.reject(new Error('No container'))),
    }, 'name', log)).rejects.toThrowError('No container');
});

test('createContainer should stop container from dockerApi', async () => {
    await expect(docker.createContainer(docker.getController({ controller: 'test' }).dockerApi, {
        name: 'container-name',
    }, 'name', log)).resolves.not.toBeUndefined();
});

test('createContainer should throw error when error occurs', async () => {
    await expect(docker.createContainer(docker.getController({ controller: 'test' }).dockerApi, {
        name: 'ko',
    }, 'name', log)).rejects.toThrowError('Error when creating container');
});

test('pull should pull image from dockerApi', async () => {
    await expect(docker.pullImage(docker.getController({ controller: 'test' }).dockerApi, undefined, 'test/test:1.2.3', log)).resolves.toBeUndefined();
});

test('pull should throw error when error occurs', async () => {
    await expect(docker.pullImage(docker.getController({ controller: 'test' }).dockerApi, undefined, 'test/test:unknown', log)).rejects.toThrowError('Error when pulling image');
});

test('removeImage should pull image from dockerApi', async () => {
    await expect(docker.removeImage(docker.getController({ controller: 'test' }).dockerApi, 'test/test:1.2.3', log)).resolves.toBeUndefined();
});

test('removeImage should throw error when error occurs', async () => {
    await expect(docker.removeImage(docker.getController({ controller: 'test' }).dockerApi, 'test/test:unknown', log)).rejects.toThrowError('Error when removing image');
});

test('clone should clone an existing container spec', () => {
    const clone = docker.cloneContainer({
        Name: '/test',
        Id: '123456789',
        HostConfig: {
            a: 'a',
            b: 'b',
        },
        Config: {
            configA: 'a',
            configB: 'b',
        },
        NetworkSettings: {
            Networks: {
                test: {
                    Aliases: ['9708fc7b44f2', 'test'],
                },
            },
        },
    }, 'test/test:2.0.0');
    expect(clone).toEqual({
        HostConfig: {
            a: 'a',
            b: 'b',
        },
        Image: 'test/test:2.0.0',
        configA: 'a',
        configB: 'b',
        name: 'test',
        NetworkingConfig: {
            EndpointsConfig: {
                test: {
                    Aliases: ['9708fc7b44f2', 'test'],
                },
            },
        },
    });
});

test('trigger should not throw when all is ok', async () => {
    await expect(docker.trigger({
        controller: 'test',
        id: '123456789',
        Name: '/container-name',
        image: {
            name: 'test/test',
            registry: {
                name: 'hub',
                url: 'my-registry',
            },
        },
        updateKind: {
            remoteValue: '4.5.6',
        },
    })).resolves.toBeUndefined();
});

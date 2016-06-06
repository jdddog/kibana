const _ = require('lodash');
const minimatch = require('minimatch');

const UiAppCollection = require('./UiAppCollection');

class UiExports {
  constructor({ urlBasePath }) {
    this.apps = new UiAppCollection(this);
    this.aliases = {};
    this.urlBasePath = urlBasePath;
    this.exportConsumer = _.memoize(this.exportConsumer);
    this.consumers = [];
    this.bundleProviders = [];
    this.defaultInjectedVars = [];
  }

  consumePlugin(plugin) {
    plugin.apps = new UiAppCollection(this);

    const types = _.keys(plugin.uiExportsSpecs);
    if (!types) return false;

    const unkown = _.reject(types, this.exportConsumer, this);
    if (unkown.length) {
      throw new Error('unknown export types ' + unkown.join(', ') + ' in plugin ' + plugin.id);
    }

    for (let consumer of this.consumers) {
      consumer.consumePlugin && consumer.consumePlugin(plugin);
    }

    types.forEach((type) => {
      this.exportConsumer(type)(plugin, plugin.uiExportsSpecs[type]);
    });
  }

  addConsumer(consumer) {
    this.consumers.push(consumer);
  }

  exportConsumer(type) {
    for (let consumer of this.consumers) {
      if (!consumer.exportConsumer) continue;
      const fn = consumer.exportConsumer(type);
      if (fn) return fn;
    }

    switch (type) {
      case 'app':
      case 'apps':
        return (plugin, specs) => {
          for (let spec of [].concat(specs || [])) {
            const app = this.apps.new(_.defaults({}, spec, {
              id: plugin.id,
              urlBasePath: this.urlBasePath
            }));

            plugin.extendInit((server, options) => { // eslint-disable-line no-loop-func
              const wrapped = app.getInjectedVars;
              app.getInjectedVars = () => wrapped.call(plugin, server, options);
            });

            plugin.apps.add(app);
          }
        };

      case 'visTypes':
      case 'fieldFormats':
      case 'spyModes':
      case 'chromeNavControls':
      case 'navbarExtensions':
        return (plugin, spec) => {
          this.aliases[type] = _.union(this.aliases[type] || [], spec);
        };

      case 'bundle':
        return (plugin, spec) => {
          this.bundleProviders.push(spec);
        };

      case 'aliases':
        return (plugin, specs) => {
          _.forOwn(specs, (spec, adhocType) => {
            this.aliases[adhocType] = _.union(this.aliases[adhocType] || [], spec);
          });
        };

      case 'injectDefaultVars':
        return (plugin, injector) => {
          plugin.extendInit(async (server, options) => {
            _.merge(this.defaultInjectedVars, await injector.call(plugin, server, options));
          });
        };
    }
  }

  find(patterns) {
    const aliases = this.aliases;
    const names = _.keys(aliases);
    const matcher = _.partialRight(minimatch.filter, { matchBase: true });

    return _.chain(patterns)
    .map(function (pattern) {
      return names.filter(matcher(pattern));
    })
    .flattenDeep()
    .reduce(function (found, name) {
      return found.concat(aliases[name]);
    }, [])
    .value();
  }

  getAllApps() {
    let { apps } = this;
    return [...apps].concat(...apps.hidden);
  }

  getApp(id) {
    return this.apps.byId[id];
  }

  getHiddenApp(id) {
    return this.apps.hidden.byId[id];
  }

  getBundleProviders() {
    return this.bundleProviders;
  }
}

module.exports = UiExports;

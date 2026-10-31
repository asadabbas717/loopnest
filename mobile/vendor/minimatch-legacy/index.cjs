const modern = require('minimatch-modern');

function callable(matcher) {
  const legacy = Object.assign((...args) => matcher(...args), matcher);
  // The installed import plugin only calls .test on makeRe results. Keep that
  // contract using the patched nonrecursive matcher, without generating regexes.
  legacy.makeRe = (pattern, options) => {
    const compiled = new matcher.Minimatch(pattern, options);
    return { test: (path) => compiled.match(path) };
  };
  legacy.defaults = (options) => callable(matcher.defaults(options));
  return legacy;
}

module.exports = callable(modern.minimatch);

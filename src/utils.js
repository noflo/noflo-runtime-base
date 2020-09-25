exports.parseName = function parseName(name) {
  if (name.indexOf('/') === -1) {
    return {
      library: null,
      name,
    };
  }
  const nameParts = name.split('/');
  return {
    library: nameParts[0],
    name: nameParts[1],
  };
};

exports.withNamespace = function withNamespace(name, namespace) {
  if (!namespace || name.indexOf('/') !== -1) {
    return name;
  }
  return `${namespace}/${name}`;
};

exports.withoutNamespace = function withoutNamespace(name) {
  if (name.indexOf('/') === -1) {
    return name;
  }
  return name.split('/')[1];
};

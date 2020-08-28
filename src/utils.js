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

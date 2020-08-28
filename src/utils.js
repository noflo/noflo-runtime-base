exports.parseName = function(name) {
  let parsed;
  if (name.indexOf('/') === -1) {
    return parsed = {
      library: null,
      name
    };
  }
  const nameParts = name.split('/');
  return parsed = {
    library: nameParts[0],
    name: nameParts[1]
  };
};

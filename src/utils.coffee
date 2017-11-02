exports.parseName = (name) ->
  if name.indexOf('/') is -1
    return parsed =
      library: null
      name: name
  nameParts = name.split '/'
  return parsed =
    library: nameParts[0]
    name: nameParts[1]

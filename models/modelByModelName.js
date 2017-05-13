'use strict';

const bookshelf = require('../bookshelf');

const Feed = bookshelf.Model.extend({
  tableName: 'feed',
  idAttribute: 'feedId'
});

const Station = bookshelf.Model.extend({
  tableName: 'station',
  idAttribute: 'globalStationId'
});

module.exports = {
  Feed: Feed,
  Feeds: bookshelf.Collection.extend({model: Feed}),
  Station: Station,
  Stations: bookshelf.Collection.extend({model: Station})
};

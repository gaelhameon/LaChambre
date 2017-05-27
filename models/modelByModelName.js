'use strict';

const moment = require('moment');

const bookshelf = require('../bookshelf');
const lib = require('./lib');


const Feed = bookshelf.Model.extend({
  tableName: 'feed',
  idAttribute: 'feedId',
  stations: function() {return this.hasMany(Station, 'feedId');},
  feedUpdates: function() {return this.hasMany(FeedUpdate, 'feedId');},

  update: function(rawFeedUpdate) {
    return this.feedUpdates().create({
      startedAt: moment().format(),
      sourceTimestamp: moment(rawFeedUpdate.timestamp).format(),
      numberOfStations: rawFeedUpdate.stations.length,
      other: { schemeSuspended: rawFeedUpdate.schemeSuspended }
    }).then((feedUpdate) => {
      return feedUpdate.updateStations(rawFeedUpdate.stations);
    }).then((stationUpdatedFeedUpdate) => {
      return stationUpdatedFeedUpdate.endFeedUpdate();
    }).then((endedFeedUpdate) => {
      return this;
    });
  }
});

const FeedUpdate = bookshelf.Model.extend({
  tableName: 'feedUpdate',
  idAttribute: 'feedUpdateId',
  feed: function () { return this.belongsTo(Feed, 'feedId'); },
  stationHistories: function () { return this.hasMany(StationHistory, 'feedUpdateId'); },
  stationStatuses: function () { return this.hasMany(StationStatus, 'feedUpdateId'); },

  updateStations: function (rawStationUpdates) {
    console.log('Will update stations based on this number of station updates: ' + rawStationUpdates.length);
    return lib.updateStations(this, rawStationUpdates);
  },

  endFeedUpdate: function () {
    return this.set('endedAt', moment().format()).save();
  },

  createNewStation: function(stationAttributes) {
    let newStation;
    return this.feed().fetch()
      .then((feed) => {
        return feed.stations().create(stationAttributes);
      }).then((station) => {
        newStation = station;
        return this.createStationHistory(newStation);
      }).then((stationHistory) => {
        return newStation;
      });
  },

  updateOneStation: function (stationAttributes) {
    let updatedStation;
    return this.feed().fetch()
      .then((feed) => {
        return feed.stations().query({ where: { localId: stationAttributes.localId } }).fetchOne();
      }).then((station) => {
        return station.save(stationAttributes, { patch: true });
      }).then((station) => {
        updatedStation = station;
        return station.updateLatestStationHistory(this);
      }).then((updatedLatestStationHistory) => {
        return this.createStationHistory(updatedStation);
      }).then((newStationHistory) => {
        return updatedStation;
      });
  },

  updateMissingStation: function(missingStationAttributes) {
      let missingStation;
      return this.feed().fetch()
      .then((feed) => {
        return feed.stations().query({ where: { localId: missingStationAttributes.localId } }).fetchOne();
      }).then((station) => {
        missingStation = station;
        return station.getLatestStationHistory();
      }).then((latestStationHistory) => {
        if (latestStationHistory.get('to')) {
          return missingStation;
        }
        else {
          return missingStation.updateLatestStationHistory(this).then(() => {
            return missingStation;
          });
        }
      });
  },

  createStationHistory: function(station) {
    const stationHistory = station.attributes;
    stationHistory.from = this.get('sourceTimestamp');
    return this.stationHistories().create(stationHistory);
  }
});

const Station = bookshelf.Model.extend({
  tableName: 'station',
  idAttribute: 'globalStationId',
  stationStatuses: function () { return this.hasMany(StationStatus, 'globalStationId'); },
  stationHistories: function () { return this.hasMany(StationHistory, 'globalStationId'); },
  feed: function () { return this.belongsTo(Feed, 'feedId'); },

  getLatestStationHistory: function () {
    return this.load({ stationHistories: (qb) => { qb.orderBy('from', 'DESC').orderBy('stationHistoryId', 'DESC'); } })
      .then((station) => {
        return station.related('stationHistories').at(0);
      });
  },
  updateLatestStationHistory: function (feedUpdate) {
    return this.getLatestStationHistory()
      .then((latestStationHistory) => {
        return latestStationHistory.set({ to: feedUpdate.get('sourceTimestamp') }).save();
      });
  }
});

const StationHistory = bookshelf.Model.extend({
  tableName: 'stationHistory',
  idAttribute: 'stationHistoryId',
  station: function() { return this.belongsTo(Station, 'stationHistoryId'); },
  feedUpdate: function() { return this.belongsTo(FeedUpdate, 'feedUpdateId'); },
});

const StationStatus = bookshelf.Model.extend({
  tableName: 'stationStatus',
  idAttribute: 'stationStatusId',
  station: function() { return this.belongsTo(Station, 'globalStationId'); },
  feedUpdate: function() { return this.belongsTo(FeedUpdate, 'feedUpdateId'); },
});

module.exports = {
  Feed: Feed,
  Feeds: bookshelf.Collection.extend({model: Feed}),
  FeedUpdate: FeedUpdate,
  Station: Station,
  Stations: bookshelf.Collection.extend({model: Station}),
  StationHistory: StationHistory
};

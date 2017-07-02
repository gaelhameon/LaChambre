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
    console.log('Will create a new feedUpdate');
    return this.feedUpdates().create({
      startedAt: moment().format(),
      sourceTimestamp: moment(rawFeedUpdate.timestamp).format(),
      numberOfStations: rawFeedUpdate.stations.length,
      other: { schemeSuspended: rawFeedUpdate.schemeSuspended }
    }).then((feedUpdate) => {
      console.log('Will update stations for this feed update.');
      return feedUpdate.updateStations(rawFeedUpdate.stations);
    }).then((stationUpdatedFeedUpdate) => {
      console.log('Will end the feed update.');
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

  createNewStation: function(parsedStation) {
    let newStation;
    return this.feed().fetch()
      .then((feed) => {
        return feed.stations().create(parsedStation.properties);
      }).then((station) => {
        newStation = station;
        return newStation.createStationHistory(this);
      }).then((stationHistory) => {
        return newStation.createStationStatus(this, parsedStation.status);
      }).then((stationStatus) => {
        return newStation;
      });
  },

  // createStationHistory: function(station) {
  //   const stationHistory = station.attributes;
  //   stationHistory.from = this.get('sourceTimestamp');
  //   return this.stationHistories().create(stationHistory);
  // }
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
  },

  getLatestStationStatus: function () {
    return this.load({ stationStatuses: (qb) => { qb.orderBy('from', 'DESC').orderBy('stationStatusId', 'DESC'); } })
      .then((station) => {
        return station.related('stationStatuses').at(0);
      });
  },
  updateLatestStationStatus: function (feedUpdate) {
    return this.getLatestStationStatus()
      .then((latestStationStatus) => {
        return latestStationStatus.set({ to: feedUpdate.get('sourceTimestamp') }).save();
      });
  },

  createStationStatus: function(feedUpdate, stationStatus) {
    stationStatus.from = feedUpdate.get('sourceTimestamp');
    stationStatus.feedUpdateId = feedUpdate.get('feedUpdateId');
    return this.stationStatuses().create(stationStatus);
  },

  createStationHistory: function(feedUpdate) {
    const stationHistory = this.attributes;
    stationHistory.from = feedUpdate.get('sourceTimestamp');
    stationHistory.feedUpdateId = feedUpdate.get('feedUpdateId');
    return this.stationHistories().create(stationHistory);
  },

  update: function (feedUpdate, parsedStation) {
    return lib.updateStationProperties(this, feedUpdate, parsedStation.properties)
      .then((updatedStation) => {
        return lib.updateStationStatus(updatedStation, feedUpdate, parsedStation.status);
      });
  },

  updateMissing: function(feedUpdate) {
    return this.getLatestStationHistory()
      .then((latestStationHistory) => {
        if (latestStationHistory.get('to')) {
          return this;
        }
        else {
          return this.updateLatestStationHistory(feedUpdate)
          .then(() => {
            return this;
          });
        }
      }).then((station) =>{
        return this.getLatestStationStatus()
          .then((latestStationStatus) => {
            if (latestStationStatus.get('to')) {
              return this;
            }
            else {
              return this.updateLatestStationStatus(feedUpdate)
              .then(() => {
                return this;
              });
            }
          });
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

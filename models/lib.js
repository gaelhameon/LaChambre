'use strict';

const _ = require('lodash');
const moment = require('moment');

exports.updateStations = function(feedUpdate, rawStationUpdates) {
  let dbStationByLocalId;
  const promise = new Promise((resolve, reject) => {
    feedUpdate.feed().fetch().then((feed) => {
      return feed.stations().fetch();
    }).then((dbStations) => {
      dbStationByLocalId = getDbStationByLocalId(dbStations);
      return Promise.all(rawStationUpdates.map((rawStationUpdate) => {
        return handleOneStation(feedUpdate, rawStationUpdate, dbStationByLocalId);
      }));
    }).then((results) => {
      const unmatchedDbStations = _.pickBy(dbStationByLocalId, (dbStation) => {
        return !dbStation.matched;
      });
      // todo: review the way we handle active/inactive stations...
      return Promise.all(_.values(unmatchedDbStations).map((unmatchedDbStation) => {
        return feedUpdate.updateMissingStation(unmatchedDbStation);
      }));
    }).then((results) => {
      resolve(feedUpdate);
    }).catch((error) => {
      reject(error);
    });
  });
  return promise;
}

function handleOneStation(feedUpdate, rawStationUpdate, dbStationByLocalId) {
  const promise = new Promise((resolve, reject) => {
    const parsedStationData = parseRawStation(rawStationUpdate, parsingInstructions);
    const newStation = parsedStationData.station;
    let dbStation = dbStationByLocalId[newStation.localId];

    if (!dbStation) {
      // This is a new station
      console.log('This is a brand new station:\n', newStation);
      feedUpdate.createNewStation(newStation)
        .then((savedStation) => {
          resolve(savedStation.toJSON());
        });
    }
    else {
      dbStation.matched = true;
      if (stationsAreTheSame(dbStation, newStation)) {
        // No need to update the station, probably no need for anything here
        // console.log('Nothing new on this station');
        resolve(rawStationUpdate.n);
      }
      else {
        console.log('Station has something new !');
        console.log('dbStation:\n', dbStation);
        console.log('newStation:\n', newStation);
        feedUpdate.updateOneStation(newStation)
          .then((updatedStation) => {
            resolve(updatedStation.toJSON());
          });
      }
    }
  });
  return promise;
}

function stationsAreTheSame(station1, station2) {
  return _.isEqual(simplifyStation(station1), simplifyStation(station2));
}

function simplifyStation(station) {
  return _.omit(_.pickBy(station), 'matched', 'feedId', 'globalStationId');
}

function getDbStationByLocalId(dbStations) {
  return _.keyBy(dbStations.toJSON(), (dbStation) => {
    // Delete properties that never exist on raw stations to ease comparison later
    // Todo: see if this is still needed with new comparison function
    delete dbStation.globalStationId;
    delete dbStation.feedId;
    // Todo: sort this bad format thing out.
    dbStation.lat = Number(dbStation.lat);
    dbStation.lon = Number(dbStation.lon);
    return dbStation.localId;
  });
}

function parseRawStation(rawStation, modelDestinationByRawStationKey) {
  const valueByColumnNameByTableName = {
    station: {},
    stationStatus: {},
    temp: {}
  };

  _.each(rawStation, (stationValue, stationKey) => {
    const modelDestination = modelDestinationByRawStationKey[stationKey];
    if (!modelDestination) {
      console.log('!!! Unknown station key: ' + stationKey);
    }
    else if (modelDestination.column === 'other') {
      valueByColumnNameByTableName[modelDestination.table][modelDestination.column] = valueByColumnNameByTableName[modelDestination.table][modelDestination.column] || {};
      valueByColumnNameByTableName[modelDestination.table][modelDestination.column][stationKey] = stationValue;
    }
    else {
      valueByColumnNameByTableName[modelDestination.table][modelDestination.column] = stationValue;
    }
  });
  _.each(valueByColumnNameByTableName, (valueByColumnName, tableName) => {
    if (valueByColumnName.other) {
      // valueByColumnName.other = JSON.stringify(valueByColumnName.other);
    }
  });
  valueByColumnNameByTableName.station.totalSpots =
    valueByColumnNameByTableName.stationStatus.availableSpots +
    valueByColumnNameByTableName.stationStatus.disabledSpots +
    valueByColumnNameByTableName.stationStatus.availableVehicles +
    valueByColumnNameByTableName.stationStatus.disabledVehicles;

  return valueByColumnNameByTableName;
}


const destStringByRawStationKey = {
  'id': 'station.localId',
  's': 'station.longName',
  'n': 'station.shortName',
  'st': 'station.other',
  'b': 'station.other',
  'su': 'station.other',
  'm': 'station.other',
  'lu': 'temp.lastUpdated',
  'lc': 'temp.lastCommunication',
  'bk': 'station.other',
  'bl': 'station.other',
  'la': 'station.lat',
  'lo': 'station.lon',
  'da': 'stationStatus.availableSpots',
  'dx': 'stationStatus.disabledSpots',
  'ba': 'stationStatus.availableVehicles',
  'bx': 'stationStatus.disabledVehicles'
}
const parsingInstructions = getParsingInstructions(destStringByRawStationKey);

function getParsingInstructions(destStringByJsonKey) {
  const parsingInstructions = {};
  _.each(destStringByJsonKey, (destString, jsonKey) => {
    parsingInstructions[jsonKey] = {
      table: destString.replace(/(.*)\.(.*)/, '$1'),
      column: destString.replace(/(.*)\.(.*)/, '$2'),
    }
  });
  return parsingInstructions;
}

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
      console.log('Will handle unmatched stations');
      const unmatchedDbStations = _.pickBy(dbStationByLocalId, (dbStation) => {
        return !dbStation.matched;
      });
      // todo: review the way we handle active/inactive stations...
      return Promise.all(_.values(unmatchedDbStations).map((unmatchedDbStation) => {
        console.log('Will update missing station');
        console.log(unmatchedDbStation.toJSON());
        return unmatchedDbStation.updateMissing(feedUpdate);
      }));
    }).then((results) => {
      resolve(feedUpdate);
    }).catch((error) => {
      reject(error);
    });
  });
  return promise;
}

exports.updateStationProperties = function(station, feedUpdate, newStationProperties) {
  const promise = new Promise((resolve, reject) => {
    if (stationsAreTheSame(station.attributes, newStationProperties)) {
      console.log('Station has nothing new.');
      resolve(station);
    }
    else {
      console.log('Station has something new !');
      // console.log('dbStation:\n', dbStation);
      // console.log('newStation:\n', newStation);
      return station.save(newStationProperties, { patch: true })
        .then((savedStation) => {
          return station.updateLatestStationHistory(feedUpdate);
        }).then((updatedLatestStationHistory) => {
          return station.createStationHistory(feedUpdate);
        }).then((newStationHistory) => {
          resolve(station);
        });
    }
  });
  return promise;
}

exports.updateStationStatus = function(station, feedUpdate, newStationStatus) {
  return station.getLatestStationStatus()
    .then((latestStationStatus) => {
      if (statusesAreTheSame(latestStationStatus.attributes, newStationStatus)) {
        console.log('Station status did not change.');
        return station;
      }
      else {
        console.log('Station status changed!');
        console.log('oldStatus:\n', latestStationStatus.attributes);
        console.log('newStatus:\n', newStationStatus);
        return latestStationStatus.set({ to: feedUpdate.get('sourceTimestamp') }).save()
          .then((updatedLatestStationStatus) => {
            return station.createStationStatus(feedUpdate, newStationStatus);
          }).then((newStationStatus) => {
            return station;
          });
      }
    });
}

function handleOneStation(feedUpdate, rawStationUpdate, dbStationByLocalId) {
  const parsedStation = parseRawStation(rawStationUpdate, parsingInstructions);

  let dbStation = dbStationByLocalId[parsedStation.properties.localId];

  if (!dbStation) {
    console.log('This is a brand new station:\n', parsedStation);
    return feedUpdate.createNewStation(parsedStation); // change to handle status too
  }
  else {
    dbStation.matched = true;
    return dbStation.update(feedUpdate, parsedStation);
  }
}

function stationsAreTheSame(station1, station2) {
  console.log(simplifyStation(station1));
  console.log(simplifyStation(station2));
  return _.isEqual(simplifyStation(station1), simplifyStation(station2));
}

function statusesAreTheSame(status1, status2) {
  console.log(simplifyStatus(status1));
  console.log(simplifyStatus(status2));
  return _.isEqual(simplifyStatus(status1), simplifyStatus(status2));
}

function simplifyStation(station) {
  return _.omit(_.pickBy(station), 'matched', 'feedId', 'globalStationId');
}

function simplifyStatus(status) {
  return _.pick(status, 'availableVehicles', 'availableSpots', 'disabledVehicles', 'disabledSpots');
}

function getDbStationByLocalId(dbStations) {
  return _.keyBy(dbStations.models, (dbStation) => {
    // Todo: sort this bad format thing out.
    dbStation.attributes.lat = Number(dbStation.attributes.lat);
    dbStation.attributes.lon = Number(dbStation.attributes.lon);
    return dbStation.attributes.localId;
  });
}

function parseRawStation(rawStation, modelDestinationByRawStationKey) {
  const parsedStation = {
    properties: {},
    status: {},
    temp: {}
  };

  _.each(rawStation, (stationValue, stationKey) => {
    const modelDestination = modelDestinationByRawStationKey[stationKey];
    if (!modelDestination) {
      console.log('!!! Unknown station key: ' + stationKey);
    }
    else if (modelDestination.column === 'other') {
      parsedStation[modelDestination.table][modelDestination.column] = parsedStation[modelDestination.table][modelDestination.column] || {};
      parsedStation[modelDestination.table][modelDestination.column][stationKey] = stationValue;
    }
    else {
      parsedStation[modelDestination.table][modelDestination.column] = stationValue;
    }
  });
  _.each(parsedStation, (valueByColumnName, tableName) => {
    if (valueByColumnName.other) {
      // valueByColumnName.other = JSON.stringify(valueByColumnName.other);
    }
  });
  parsedStation.properties.totalSpots =
    parsedStation.status.availableSpots +
    parsedStation.status.disabledSpots +
    parsedStation.status.availableVehicles +
    parsedStation.status.disabledVehicles;

  return parsedStation;
}


const destStringByRawStationKey = {
  'id': 'properties.localId',
  's': 'properties.longName',
  'n': 'properties.shortName',
  'st': 'properties.other',
  'b': 'properties.other',
  'su': 'properties.other',
  'm': 'properties.other',
  'lu': 'temp.lastUpdated',
  'lc': 'temp.lastCommunication',
  'bk': 'properties.other',
  'bl': 'properties.other',
  'la': 'properties.lat',
  'lo': 'properties.lon',
  'da': 'status.availableSpots',
  'dx': 'status.disabledSpots',
  'ba': 'status.availableVehicles',
  'bx': 'status.disabledVehicles'
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

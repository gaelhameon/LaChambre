'use strict';

exports.up = (knex) => {
  return knex.schema
    .createTable('feed', (table) => {
      table.increments('feedId').primary();
      table.string('shortName');
      table.string('url');
    })
    .createTable('feedUpdate', (table) => {
      table.increments('feedUpdateId').primary();
      table.integer('feedId').references('feed.feedId');
      table.timestamp('startedAt');
      table.timestamp('endedAt');
      table.timestamp('sourceTimestamp');
      table.integer('numberOfStations');
      table.json('other');
    })
    .createTable('station', (table) => {
      table.increments('globalStationId').primary();
      table.integer('feedId').references('feed.feedId');
      table.integer('localId');
      table.string('shortName');
      table.string('longName');
      table.string('address');
      table.decimal('lat', 17, 15);
      table.decimal('lon', 17, 14);
      table.integer('totalSpots');
      table.json('other');
    })
    .createTable('stationHistory', (table) => {
      table.increments('stationHistoryId').primary();
      table.integer('globalStationId').references('station.globalStationId');
      table.integer('feedId').references('feed.feedId');
      table.integer('feedUpdateId').references('feedUpdate.feedUpdateId');
      table.integer('localId');
      table.timestamp('from');
      table.timestamp('to');
      table.string('shortName');
      table.string('longName');
      table.string('address');
      table.decimal('lat', 17, 15);
      table.decimal('lon', 17, 14);
      table.integer('totalSpots');
      table.json('other');
    })
    .createTable('stationStatus', (table) => {
      table.increments('stationStatusId').primary();
      table.integer('globalStationId').references('station.globalStationId');
      table.integer('feedUpdateId').references('feedUpdate.feedUpdateId');
      table.timestamp('from');
      table.timestamp('to');
      table.integer('availableVehicles');
      table.integer('availableSpots');
      table.integer('disabledVehicles');
      table.integer('disabledSpots');
    });
}

exports.down = (knex) => {
  return knex.schema
    .dropTable('stationStatus')
    .dropTable('stationHistory')
    .dropTable('feedUpdate')
    .dropTable('station')
    .dropTable('feed');
};
'use strict';

exports.up = (knex) => {
  return knex.schema
    .createTable('feed', (table) => {
      table.increments('feedId').primary();
      table.string('shortName');
      table.string('url');
    })
    .createTable('station', (table) => {
      table.increments('globalStationId').primary();
      table.integer('feedId');
      table.integer('localId');
      table.string('shortName');
      table.string('longName');
      table.string('address');
      table.decimal('lat', 16, 14);
      table.decimal('lon', 17, 14);
      table.integer('totalSpots');
      table.json('other');
    })
    .createTable('stationStatus', (table) => {
      table.increments('stationStatusId').primary();
      table.integer('feedId');
      table.timestamp('since');
      table.integer('availableVehicles');
      table.integer('availableSpots');
      table.integer('disabledVehicles');
      table.integer('disabledSpots');
    });
}

exports.down = (knex) => {
  return knex.schema
    .dropTable('feed')
    .dropTable('station')
    .dropTable('stationStatus');
};

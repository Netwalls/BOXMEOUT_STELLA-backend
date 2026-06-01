/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('user_sessions', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'text', notNull: true },
    session_token: { type: 'text', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('user_sessions', 'user_id');
  pgm.createIndex('user_sessions', 'expires_at');

  pgm.createTable('password_reset_tokens', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'text', notNull: true },
    token_hash: { type: 'text', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('password_reset_tokens', 'user_id');
  pgm.createIndex('password_reset_tokens', 'expires_at');

  pgm.addColumn('notification_jobs', {
    deleted_at: { type: 'timestamptz' },
  });

  pgm.createTable('distributions', {
    id: { type: 'serial', primaryKey: true },
    market_id: { type: 'text', notNull: true, references: 'markets(market_id)' },
    bettor_address: { type: 'text', notNull: true },
    amount: { type: 'numeric', notNull: true },
    status: { type: 'text', notNull: true, default: 'pending' },
    tx_hash: { type: 'text' },
    archived_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('distributions', 'market_id');
  pgm.createIndex('distributions', 'status');
  pgm.createIndex('distributions', 'created_at');
};

exports.down = (pgm) => {
  pgm.dropTable('distributions');
  pgm.dropColumn('notification_jobs', 'deleted_at');
  pgm.dropTable('password_reset_tokens');
  pgm.dropTable('user_sessions');
};

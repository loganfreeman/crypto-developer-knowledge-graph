# Polkadot Staking And Validator Operations

Polkadot staking and validator operations depend on live chain state, runtime constants, sessions, eras, validator set membership, nominations, rewards, and offenses or slashes. Developers should query chain state through runtime-aware APIs instead of treating staking parameters as static documentation.

The Polkadot developer docs describe API categories for constants, chain state, and transactions. Runtime constants can be read from `api.consts`, while state such as active validators, accounts, and staking data is queried from `api.query`.

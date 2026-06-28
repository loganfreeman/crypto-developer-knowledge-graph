# Verification Targets

## Seeded Targets

- `substrate-scale-byte-template`: checks Polkadot `state_getMetadata` and `state_getRuntimeVersion`.
- `erc20-transfer-calldata-template`: checks deployed Ethereum contract bytecode and ERC-20 transfer selector.
- `ethereum-legacy-rlp-byte-template`: checks `eth_chainId` for EIP-155 signing.

## Data Files

- `data/live_metadata.json`
- `data/network_conditions.json`

## Database Tables

- `live_metadata_targets`
- `live_metadata_checks`
- `network_conditions` data is currently exported separately through JSON and surfaced in the frontend State tab.

## Reporting Rules

- Say when data is cached or stale.
- Do not invent live values when RPC is unavailable.
- For EVM ABIs, note that ABI JSON is normally off-chain; live verification can prove bytecode exists at an address, while ABI shape must be grounded by standards/docs or verified source APIs.
- For runtime-based chains, treat runtime metadata and version as live dependencies that can change after upgrades.

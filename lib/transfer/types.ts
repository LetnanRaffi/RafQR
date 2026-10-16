export interface TransferProvider {
  readonly mode: 'p2p' | 'cloud';
  cancel(): void;
}

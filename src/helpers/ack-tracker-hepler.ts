export const publishingMap = new Map<number, boolean>();

export const pendingAckMap = new Map<
  string,
  { resolve: (value: boolean) => void; sequenceNumber?: number }
>();

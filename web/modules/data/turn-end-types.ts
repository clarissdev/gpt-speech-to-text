export enum TurnDetectionTypeId {
  server_vad = 'server_vad',
}

export interface TurnDetectionType {
  id: TurnDetectionTypeId;
  name: string;
  description: string;
}

export const turnDetectionTypes: TurnDetectionType[] = [
  {
    id: TurnDetectionTypeId.server_vad,
    name: 'Server VAD',
    description:
      'The model will automatically detect when the user has finished speaking and end the turn.',
  },
];

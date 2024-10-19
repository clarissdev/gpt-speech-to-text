import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export async function POST() {
  const roomName = Math.random().toString(36);
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set');
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: 'human',
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
  });
  return NextResponse.json({
    accessToken: await at.toJwt(),
    url: process.env.LIVEKIT_URL,
  });
}

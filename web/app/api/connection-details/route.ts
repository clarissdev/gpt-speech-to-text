import { AccessToken, VideoGrant } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

import { randomString } from '@/lib/client-utils';
import { ConnectionDetails } from '@/lib/types';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

export async function POST(request: NextRequest) {
  try {
    // Parse query parameters
    const { roomName, participantName, region, metadata } = await request.json();
    const livekitServerUrl = region ? getLiveKitURL(region) : LIVEKIT_URL;
    if (livekitServerUrl === undefined) {
      throw new Error('Invalid region');
    }

    if (typeof roomName !== 'string') {
      return new NextResponse('Missing required query parameter: roomName', { status: 400 });
    }
    if (participantName === null) {
      return new NextResponse('Missing required query parameter: participantName', { status: 400 });
    }
    // Generate participant token
    const at = new AccessToken(API_KEY, API_SECRET, {
      identity: `${participantName}__${randomString(4)}`,
      name: participantName,
      metadata: JSON.stringify(metadata),
    });
    at.ttl = '60m';
    const grant: VideoGrant = {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      canUpdateOwnMetadata: true,
    };
    at.addGrant(grant);

    // Return connection details
    const data: ConnectionDetails = {
      serverUrl: livekitServerUrl,
      roomName: roomName,
      participantToken: await at.toJwt(),
      participantName: participantName,
    };
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 500 });
    }
  }
}
/**
 * Get the LiveKit server URL for the given region.
 */
function getLiveKitURL(region: string | null): string {
  let targetKey = 'LIVEKIT_URL';
  if (region) {
    targetKey = `LIVEKIT_URL_${region}`.toUpperCase();
  }
  const url = process.env[targetKey];
  if (!url) {
    throw new Error(`${targetKey} is not defined`);
  }
  return url;
}

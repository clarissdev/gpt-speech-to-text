'use client';

import {
  formatChatMessageLinks,
  LiveKitRoom,
  LocalUserChoices,
  PreJoin,
} from '@livekit/components-react';
import {
  ExternalE2EEKeyProvider,
  RoomOptions,
  VideoCodec,
  VideoPresets,
  Room,
  DeviceUnsupportedError,
  RoomConnectOptions,
} from 'livekit-client';
import { useRouter } from 'next/navigation';
import extractTextFromPdf from 'pdf-parser-client-side';
import React from 'react';

import styles from './PageClientImpl.module.scss';
import { ConnectionProvider } from './use-connection';
import { VideoConferenceV2 } from './VideoConferenceV2';

import { decodePassphrase } from '@/lib/client-utils';
import { RecordingIndicator } from '@/lib/RecordingIndicator';
import { SettingsMenu } from '@/lib/SettingsMenu';
import { ConnectionDetails } from '@/lib/types';

const CONN_DETAILS_ENDPOINT =
  process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';
const SHOW_SETTINGS_MENU = process.env.NEXT_PUBLIC_SHOW_SETTINGS_MENU == 'true';

export function PageClientImpl(props: {
  roomName: string;
  region?: string;
  hq: boolean;
  codec: VideoCodec;
}) {
  const [preJoinChoices, setPreJoinChoices] = React.useState<LocalUserChoices | undefined>(
    undefined,
  );
  const [resume, setResume] = React.useState('');
  const [jobDescription, setJobDescription] = React.useState<string>('');
  const [instructions, setInstructions] = React.useState('');
  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target?.files?.[0];
    if (!file) {
      setResume('');
      return;
    }
    const text = await extractTextFromPdf(file, 'alphanumericwithspaceandpunctuationandnewline');
    if (typeof text === 'string') setResume(text);
    else alert('invalid parsed content');
  };

  const handleUploadInfo = async () => {
    if (resume === '' || jobDescription === '') {
      alert('Your CV or job description is lacking content.');
      return;
    }
    setInstructions(`You are an AI assistant tasked with generating interview questions for a candidate based on their resume and a specific job description.
    Resume: ${resume}
    Job Description: ${jobDescription}

    Please analyze the resume and job description to create a set of tailored interview questions that assess the candidate's qualifications, skills, and experiences relevant to the role. Focus on the following areas:

    Technical Skills: Questions that evaluate the candidate’s specific technical abilities mentioned in the resume.
    Experience: Questions that explore the candidate’s past work experiences and achievements related to the job description.
    Cultural Fit: Questions that determine how well the candidate aligns with the company’s values and work environment.
    Problem-Solving and Critical Thinking: Questions that assess the candidate’s approach to challenges and their ability to think critically in relevant scenarios.
    Behavioral Questions: Questions based on the candidate's previous experiences to understand their behavior in various situations.

    Now you are the interviewer and I am the interviewee. Please start by giving a welcome and ask the interviewee to introduce themselves.
    `);
  };

  const preJoinDefaults = React.useMemo(() => {
    return {
      username: '',
      videoEnabled: true,
      audioEnabled: true,
    };
  }, []);
  const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails | undefined>(
    undefined,
  );

  const handlePreJoinSubmit = async (values: LocalUserChoices) => {
    setPreJoinChoices(values);
    const openaiApiKey = process.env.NEXT_PUBLIC_OPEN_AI_KEY;
    const url = new URL(CONN_DETAILS_ENDPOINT, window.location.origin);
    const connectionDetailsResp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roomName: props.roomName,
        participantName: values.username,
        region: props.region,
        metadata: {
          openai_api_key: openaiApiKey,
          instructions,
        },
      }),
    });
    const connectionDetailsData = await connectionDetailsResp.json();
    setConnectionDetails(connectionDetailsData);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePreJoinError = React.useCallback((e: any) => console.error(e), []);

  return (
    <main data-lk-theme="default" style={{ height: '100%' }}>
      {instructions === '' ? (
        <form
          onSubmit={handleUploadInfo}
          style={{ display: 'grid', placeItems: 'center', height: '100%' }}
        >
          <div className={styles.uploadcv}>
            <h1>Welcome to Your Interview Assistant!</h1>
            <p>
              To help you prepare effectively, we need a little information from you. Please share
              your CV and the Job Description of the role you are applying to.
            </p>
            <p style={{ fontWeight: '600' }}>Upload your CV here: </p>
            <input type="file" onChange={onFileChange}></input>
            <p style={{ fontWeight: '600' }}>Enter Job Description here: </p>
            <textarea
              className={styles.textarea}
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            ></textarea>
            <button style={{ marginTop: '20px' }}>Submit</button>
          </div>
        </form>
      ) : connectionDetails === undefined || preJoinChoices === undefined ? (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <PreJoin
            defaults={preJoinDefaults}
            onSubmit={handlePreJoinSubmit}
            onError={handlePreJoinError}
          />
        </div>
      ) : (
        <VideoConferenceComponent
          connectionDetails={connectionDetails}
          userChoices={preJoinChoices}
          options={{ codec: props.codec, hq: props.hq }}
        />
      )}
    </main>
  );
}

function VideoConferenceComponent(props: {
  userChoices: LocalUserChoices;
  connectionDetails: ConnectionDetails;
  options: {
    hq: boolean;
    codec: VideoCodec;
  };
}) {
  const e2eePassphrase =
    typeof window !== 'undefined' && decodePassphrase(location.hash.substring(1));

  const worker =
    typeof window !== 'undefined' &&
    e2eePassphrase &&
    new Worker(new URL('livekit-client/e2ee-worker', import.meta.url));
  const e2eeEnabled = !!(e2eePassphrase && worker);
  const keyProvider = new ExternalE2EEKeyProvider();
  const [e2eeSetupComplete, setE2eeSetupComplete] = React.useState(false);

  const roomOptions = React.useMemo((): RoomOptions => {
    let videoCodec: VideoCodec | undefined = props.options.codec ? props.options.codec : 'vp9';
    if (e2eeEnabled && (videoCodec === 'av1' || videoCodec === 'vp9')) {
      videoCodec = undefined;
    }
    return {
      videoCaptureDefaults: {
        deviceId: props.userChoices.videoDeviceId ?? undefined,
        resolution: props.options.hq ? VideoPresets.h2160 : VideoPresets.h720,
      },
      publishDefaults: {
        dtx: false,
        videoSimulcastLayers: props.options.hq
          ? [VideoPresets.h1080, VideoPresets.h720]
          : [VideoPresets.h540, VideoPresets.h216],
        red: !e2eeEnabled,
        videoCodec,
      },
      audioCaptureDefaults: {
        deviceId: props.userChoices.audioDeviceId ?? undefined,
      },
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      e2ee: e2eeEnabled
        ? {
            keyProvider,
            worker,
          }
        : undefined,
    };
  }, [props.userChoices, props.options.hq, props.options.codec]);

  const room = React.useMemo(() => new Room(roomOptions), []);

  React.useEffect(() => {
    if (e2eeEnabled) {
      keyProvider
        .setKey(decodePassphrase(e2eePassphrase))
        .then(() => {
          room.setE2EEEnabled(true).catch((e) => {
            if (e instanceof DeviceUnsupportedError) {
              alert(
                `You're trying to join an encrypted meeting, but your browser does not support it. Please update it to the latest version and try again.`,
              );
              console.error(e);
            } else {
              throw e;
            }
          });
        })
        .then(() => setE2eeSetupComplete(true));
    } else {
      setE2eeSetupComplete(true);
    }
  }, [e2eeEnabled, room, e2eePassphrase]);

  const connectOptions = React.useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

  const router = useRouter();
  const handleOnLeave = React.useCallback(() => router.push('/'), [router]);
  const handleError = React.useCallback((error: Error) => {
    console.error(error);
    alert(`Encountered an unexpected error, check the console logs for details: ${error.message}`);
  }, []);
  const handleEncryptionError = React.useCallback((error: Error) => {
    console.error(error);
    alert(
      `Encountered an unexpected encryption error, check the console logs for details: ${error.message}`,
    );
  }, []);

  return (
    <>
      <LiveKitRoom
        connect={e2eeSetupComplete}
        room={room}
        token={props.connectionDetails.participantToken}
        serverUrl={props.connectionDetails.serverUrl}
        connectOptions={connectOptions}
        video={props.userChoices.videoEnabled}
        audio={props.userChoices.audioEnabled}
        onDisconnected={handleOnLeave}
        onEncryptionError={handleEncryptionError}
        onError={handleError}
      >
        <ConnectionProvider>
          <VideoConferenceV2
            chatMessageFormatter={formatChatMessageLinks}
            SettingsComponent={SHOW_SETTINGS_MENU ? SettingsMenu : undefined}
          ></VideoConferenceV2>
          <RecordingIndicator />
        </ConnectionProvider>
      </LiveKitRoom>
    </>
  );
}

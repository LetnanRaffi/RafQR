'use client';

import { useParams, useRouter } from 'next/navigation';
import P2PReceiver from '../../../components/P2PReceiver';

export default function P2PReceivePage() {
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  return <P2PReceiver code={code} onClose={() => router.push('/')} />;
}

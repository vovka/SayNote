'use client';

import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/auth-gate';
import { AuthControls } from '@/components/auth-controls';
import { SettingsModal } from '@/components/settings-modal';

function SettingsPageContent() {
  const router = useRouter();
  return (
    <main>
      <AuthControls />
      <SettingsModal isOpen onClose={() => router.push('/')} />
    </main>
  );
}

export default function SettingsPage() {
  return (
    <AuthGate>
      <SettingsPageContent />
    </AuthGate>
  );
}

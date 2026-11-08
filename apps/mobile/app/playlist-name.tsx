import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { cleanPlaylistName } from '@/lib/playlists';
import { colors } from '@/lib/theme';
import { usePlaylistStore } from '@/stores/usePlaylistStore';

/**
 * Names a playlist. With `id` it renames that one; otherwise it creates one,
 * and with `trackId` adds that song to it straight away.
 */
export default function PlaylistNameSheet() {
  const { id, trackId } = useLocalSearchParams<{ id?: string; trackId?: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const existing = usePlaylistStore(s => (id ? s.playlists.find(p => p.id === id) : undefined));
  const [name, setName] = useState(existing?.name ?? '');
  const [saving, setSaving] = useState(false);
  const clean = cleanPlaylistName(name);

  const save = async () => {
    if (!clean || saving) return;
    setSaving(true);
    const store = usePlaylistStore.getState();
    if (existing) {
      await store.rename(db, existing.id, clean);
    } else {
      const created = await store.create(db, clean);
      if (trackId) await store.addTrack(db, created, trackId);
    }
    router.back();
  };

  return (
    <Sheet
      title={existing ? 'Rename playlist' : 'New playlist'}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={() => router.back()} />
          <Button label={existing ? 'Save' : 'Create'} onPress={save} disabled={!clean || saving} />
        </>
      }
    >
      <View className="px-6 pt-3">
        <TextInput
          value={name}
          onChangeText={setName}
          autoFocus
          maxLength={60}
          placeholder="Playlist name"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="Playlist name"
          className="h-14 rounded-xl border border-border-strong bg-muted px-4 font-body text-[16px] text-foreground focus:border-primary"
        />
      </View>
    </Sheet>
  );
}

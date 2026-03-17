import { useAmbientColor } from '@/hooks/useAmbientColor';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { motion, AnimatePresence } from 'motion/react';

export function AmbientBackground() {
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const ambientColor = useAmbientColor();

  return (
    <AnimatePresence>
      {currentTrack && (
        <motion.div
          key={ambientColor.hex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5 }}
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            background: `
              radial-gradient(ellipse at 0% 0%, rgba(${ambientColor.rgb}, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 100% 100%, rgba(${ambientColor.rgb}, 0.08) 0%, transparent 50%)
            `,
          }}
        />
      )}
    </AnimatePresence>
  );
}

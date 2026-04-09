import { useAmbientColor } from '@/hooks/useAmbientColor';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAppStore } from '@/stores/useAppStore';
import { motion, AnimatePresence } from 'motion/react';

export function AmbientBackground() {
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const ambientColor = useAmbientColor();
  const lowPerformanceMode = useAppStore(s => s.lowPerformanceMode);

  if (lowPerformanceMode) return null;

  return (
    <>
      {/* Noise texture overlay */}
      <div className="noise fixed inset-0 z-[9998] pointer-events-none" />

      <AnimatePresence>
        {currentTrack && (
          <motion.div
            key={ambientColor.hex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            className="fixed inset-0 pointer-events-none z-0"
            style={{
              background: `
                radial-gradient(ellipse at 10% 20%, rgba(${ambientColor.rgb}, 0.1) 0%, transparent 60%),
                radial-gradient(ellipse at 90% 80%, rgba(${ambientColor.rgb}, 0.06) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 50%, rgba(${ambientColor.rgb}, 0.03) 0%, transparent 70%)
              `,
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

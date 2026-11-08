import { useState } from 'react';
import { Image, View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import { THEME_PHOTOS, coverLayout, type ThemePhotoName } from '@/lib/photos';
import { cn } from '@/lib/utils';

interface ThemePhotoProps extends ViewProps {
  photo: ThemePhotoName;
  /** Focal point in percent, like CSS background-position. */
  x?: number;
  y?: number;
  zoom?: number;
  /** Known frame size; without it the photo measures its container. */
  size?: { width: number; height: number };
  className?: string;
}

/** A theme photo cropped to cover its frame around a focal point. */
export function ThemePhoto({
  photo,
  x = 50,
  y = 50,
  zoom = 1,
  size,
  className,
  children,
  style,
  ...props
}: ThemePhotoProps) {
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const box = size ?? measured;
  const asset = THEME_PHOTOS[photo];

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== measured?.width || height !== measured?.height) setMeasured({ width, height });
  };

  const layout = box ? coverLayout(asset, box.width, box.height, x, y, zoom) : null;

  return (
    <View
      className={cn('overflow-hidden bg-card', className)}
      style={[size, style]}
      onLayout={size ? undefined : onLayout}
      {...props}
    >
      {layout && (
        <Image
          source={asset.source}
          accessibilityIgnoresInvertColors
          style={{ position: 'absolute', ...layout }}
          fadeDuration={0}
        />
      )}
      {children}
    </View>
  );
}

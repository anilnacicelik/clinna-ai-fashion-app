/**
 * CLINNA AI — App.tsx
 * expo-font ile Great Vibes calligraphic script yüklenir.
 * Font yüklenene kadar SplashScreen bekletilir — "CLINNA" ilk frame'de doğru render edilir.
 */
import 'react-native-url-polyfill/auto';
import 'react-native-gesture-handler';
import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import AppNavigator from './src/navigation/AppNavigator';

// Splash screen'i font yüklenene kadar tut
SplashScreen.preventAutoHideAsync();

export default function App() {
  // ── Font yükle ────────────────────────────────────────────────
  // "GreatVibes" key'i — assets/fonts/ klasöründeki dosya adıyla eşleşmeli.
  //
  // KURULUM (terminalden bir kere çalıştır):
  //   npx expo install expo-font expo-splash-screen
  //
  // FONT DOSYASI:
  //   1. https://fonts.google.com/specimen/Great+Vibes adresinden indir
  //   2. GreatVibes-Regular.ttf dosyasını → mobile/assets/fonts/ klasörüne koy
  //
  // Alternatif daha dramatik seçenekler (görseldeki "En Attendant Godot" stili):
  //   - "Pinyon Script"    → https://fonts.google.com/specimen/Pinyon+Script
  //   - "Alex Brush"       → https://fonts.google.com/specimen/Alex+Brush
  //   Birini seçip aynı şekilde assets/fonts/ klasörüne ekle, aşağıdaki key'i güncelle.
  const [fontsLoaded, fontError] = useFonts({
    'MissFajardose': require('./assets/fonts/MissFajardose-Regular.ttf'),
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Font henüz yüklenmediyse boş ekran göster (splash screen görünür)
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <AppNavigator />
    </View>
  );
}

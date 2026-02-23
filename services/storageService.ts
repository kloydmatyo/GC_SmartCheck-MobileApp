import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { GradingResult } from '../types/scanning';

const STORAGE_KEY = '@scans_history';

export class StorageService {
    /**
     * Save a grading result to local storage and move the image to the app's document directory
     */
    static async saveScanResult(result: GradingResult, imageUri: string): Promise<void> {
        try {
            // 1. Move image to permanent storage so it persists
            const filename = `scan_${Date.now()}.jpg`;
            // @ts-ignore
            const newPath = `${FileSystem.documentDirectory}${filename}`;

            if (imageUri.startsWith('data:')) {
                // Extract base64 without the prefix
                const base64Data = imageUri.split(',')[1];
                await FileSystem.writeAsStringAsync(newPath, base64Data, {
                    encoding: FileSystem.EncodingType.Base64,
                });
            } else {
                await FileSystem.copyAsync({
                    from: imageUri,
                    to: newPath,
                });
            }

            // 2. Attach metadata
            const deviceId = Constants.installationId || Constants.deviceId || 'unknown_device';
            const scanWithMeta: GradingResult = {
                ...result,
                metadata: {
                    ...result.metadata,
                    timestamp: Date.now(),
                    deviceId,
                    imageUri: newPath,
                },
            };

            // 3. Save to AsyncStorage
            const historyStr = await AsyncStorage.getItem(STORAGE_KEY);
            const history: GradingResult[] = historyStr ? JSON.parse(historyStr) : [];
            history.unshift(scanWithMeta); // Add to the top

            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        } catch (error) {
            console.error('Failed to save scan result:', error);
            throw error;
        }
    }

    /**
     * Get all scan history
     */
    static async getHistory(): Promise<GradingResult[]> {
        try {
            const historyStr = await AsyncStorage.getItem(STORAGE_KEY);
            return historyStr ? JSON.parse(historyStr) : [];
        } catch (error) {
            console.error('Failed to load history:', error);
            return [];
        }
    }

    /**
     * Clear all history and stored images
     */
    static async clearHistory(): Promise<void> {
        try {
            const history = await this.getHistory();

            // Delete images
            for (const item of history) {
                if (item.metadata?.imageUri) {
                    const fileInfo = await FileSystem.getInfoAsync(item.metadata.imageUri);
                    if (fileInfo.exists) {
                        await FileSystem.deleteAsync(item.metadata.imageUri);
                    }
                }
            }

            await AsyncStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.error('Failed to clear history:', error);
            throw error;
        }
    }
}

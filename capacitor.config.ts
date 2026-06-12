import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.betwithfriend.app',
	appName: 'Bet with Friend',
	webDir: 'build',
	server: {
		// Remove this block for production builds
		url: 'http://localhost:5173',
		cleartext: true
	}
};

export default config;

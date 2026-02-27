# GC SmartCheck Mobile App - Zipgrade Scanner & Generator

A React Native mobile application built with Expo for Gordon College faculty to generate and scan Zipgrade-compatible answer sheets with automatic grading.

## Features

### 🔐 Authentication

- **Faculty Sign-In**: Secure login for Gordon College faculty and staff
- **Email Validation**: Enforces @gordoncollege.edu.ph email format
- **Test Accounts**: Built-in dummy accounts for development and testing
- **Protected Routes**: Authentication required before accessing app features

### 🔍 Zipgrade Scanner

- **Mobile Camera Integration**: Capture Zipgrade answer sheets using device camera
- **Student ID Recognition**: Automatically read 8-digit student ID bubbles
- **Answer Detection**: Scan and interpret bubble answers (A, B, C, D)
- **Auto-Grading**: Compare answers with answer key and compute scores
- **Instant Results**: Show success toast with Student ID and score
- **Detailed Results**: View question-by-question breakdown

### 📄 Answer Sheet Generator

- **Zipgrade Templates**: Generate standard 20, 50, or 100 question sheets
- **Blank Sheets**: Create empty answer sheets for exams
- **Pre-filled Test Sheets**: Generate sheets with random answers for testing
- **Print-Ready Format**: SVG output compatible with standard printers
- **Multiple Configurations**: Support for different exam IDs and versions

### 🎮 Interactive Demo

- **Complete Workflow**: Test generation → scanning → grading
- **Simulated Processing**: See how the scanner works with generated sheets
- **Real-time Results**: View actual grading output and statistics

### 📱 User Interface

- **Four Dedicated Tabs**: Scanner, Generator, Demo, and Home
- **Camera View**: Real-time camera with Zipgrade alignment guides
- **Results Display**: Comprehensive score and answer details
- **Toast Notifications**: Success/error feedback
- **Responsive Design**: Optimized for mobile devices

## Tech Stack

- **React Native** with Expo
- **TypeScript** for type safety
- **Expo Camera** for image capture
- **React Native Toast Message** for notifications
- **React Native SVG** for answer sheet preview
- **Expo Router** for navigation

## Project Structure

```
├── app/
│   ├── (tabs)/
│   │   ├── scanner.tsx          # Scanner tab screen
│   │   ├── generator.tsx        # Generator tab screen
│   │   ├── demo.tsx             # Demo tab screen
│   │   └── index.tsx            # Home tab screen
│   ├── sign-in.tsx              # Authentication screen
│   ├── index.tsx                # App entry point with auth redirect
│   └── _layout.tsx              # Root layout with navigation
├── components/
│   ├── scanner/
│   │   ├── CameraScanner.tsx    # Camera interface
│   │   ├── ScanResults.tsx      # Results display
│   │   └── ScannerScreen.tsx    # Main scanner screen
│   ├── generator/               # Answer sheet generator components
│   ├── demo/                    # Demo workflow components
│   └── ui/
│       └── ToastConfig.tsx      # Toast configuration
├── services/
│   ├── authService.ts           # Authentication logic
│   ├── scanningService.ts       # Image processing & OCR
│   ├── gradingService.ts        # Answer grading logic
│   └── zipgradeGenerator.ts     # Answer sheet generation
├── types/
│   ├── scanning.ts              # Scanning interfaces
│   └── zipgrade.ts              # Zipgrade interfaces
├── hooks/
│   └── useAnswerKey.ts          # Answer key management
└── utils/
    └── imageProcessing.ts       # Image processing utilities
```

## Installation

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm start
```

3. Run on device/simulator:

```bash
npm run android  # For Android
npm run ios      # For iOS
```

### Install Expo Go (mobile)

- **Android**: Install the "Expo Go" app from Google Play. Open the app and scan the QR code shown after `npm start` to load the project on your device.
- **iOS**: Install the "Expo Go" app from the App Store. Use the in-app QR scanner or the iOS camera to open the development URL shown by `npm start`.
- **Tips**: If your computer and device are not on the same network, use the Tunnel connection in the Expo dev server (press `t` or select Tunnel) to open the project. Make sure your Expo SDK version is compatible with the installed Expo Go app.

## Usage

### Authentication

When you first open the app, you'll be presented with the sign-in screen.

**Test Accounts for Development:**

- Email: `faculty@gordoncollege.edu.ph` | Password: `password123`
- Email: `admin@gordoncollege.edu.ph` | Password: `admin123`
- Email: `teacher@gordoncollege.edu.ph` | Password: `teacher123`

Tap the "🔑 View Test Accounts" button on the sign-in screen to see these credentials.

### For Instructors/Scanners

1. **Sign In**: Enter your Gordon College email and password
2. **Open Scanner Tab**: Navigate to the Scanner tab in the app
3. **Start Scanning**: Tap "Start Scanning" button
4. **Align Answer Sheet**: Position the answer sheet within the camera frame
5. **Capture**: Tap the capture button to scan the sheet
6. **View Results**: Review the grading results and student score
7. **Continue**: Scan additional sheets or close the scanner

### Key Components

#### ScanningService

- Processes captured images
- Extracts student IDs and answers
- Validates scan quality
- Mock implementation with real-world integration points

#### GradingService

- Compares student answers with answer key
- Calculates scores and percentages
- Provides detailed question breakdown
- Exports results to CSV format

#### CameraScanner

- Real-time camera interface
- Answer sheet alignment guides
- Quality validation before processing
- User-friendly controls

## Configuration

### Authentication Setup

The app currently uses dummy accounts for testing. For production:

- Replace `authService.ts` with actual API integration
- Implement secure token storage (AsyncStorage, SecureStore)
- Add session management and auto-logout
- Connect to Gordon College authentication system

### Answer Key Setup

The app uses a default answer key for demonstration. In production:

- Load answer keys from API or local storage
- Support multiple exam configurations
- Allow dynamic answer key updates

### Image Processing

Current implementation uses mock processing. For production:

- Integrate computer vision libraries (OpenCV, TensorFlow)
- Use cloud OCR services (Google Vision, AWS Textract)
- Implement bubble detection algorithms

## Development Notes

### Mock Implementation

The current version includes mock implementations for:

- Authentication (dummy accounts in `authService.ts`)
- Image processing and OCR
- Bubble detection
- Student ID extraction

### Production Considerations

For production deployment:

1. **Authentication**:
   - Integrate with Gordon College authentication system
   - Implement JWT or OAuth tokens
   - Add secure credential storage
   - Enable password reset functionality

2. **Computer Vision**: Integrate real image processing libraries
3. **Cloud Services**: Use OCR APIs for better accuracy
4. **Data Storage**: Implement proper data persistence
5. **Security**: Add data encryption and secure API communication
6. **Performance**: Optimize for various device capabilities

## API Integration Points

The app is designed with clear integration points for:

- **Authentication API**: Replace `authService.signIn()` with actual API calls
- **OCR Services**: Google Vision API, AWS Textract
- **Image Processing**: OpenCV, custom algorithms
- **Data Storage**: Firebase, REST APIs
- **User Management**: Gordon College authentication system

## Testing

Run the app in development mode to test:

- Authentication flow with dummy accounts
- Protected route navigation
- Camera functionality
- Mock scanning and grading
- UI interactions
- Toast notifications

### Test Credentials

Use the built-in test accounts to access the app during development. These accounts validate the Gordon College email format and provide a realistic authentication experience.

## Contributing

1. Follow TypeScript best practices
2. Maintain component separation
3. Add proper error handling
4. Update documentation for new features

## License

This project is part of the SmartCheck mobile application system.

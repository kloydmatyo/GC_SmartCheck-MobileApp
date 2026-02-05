# SmartCheck Mobile App - Scanning & Auto-Grading System

A React Native mobile application built with Expo for scanning and automatically grading student answer sheets.

## Features

### 🔍 Scanning & Auto-Grading Subsystem

- **Mobile Camera Integration**: Capture answer sheets using device camera
- **Student ID Recognition**: Automatically read student ID bubbles
- **Answer Detection**: Scan and interpret bubble answers (A, B, C, D)
- **Auto-Grading**: Compare answers with answer key and compute scores
- **Instant Results**: Show success toast with Student ID and score
- **Detailed Results**: View question-by-question breakdown

### 📱 User Interface

- **Scanner Tab**: Dedicated tab for scanning functionality
- **Camera View**: Real-time camera with alignment guides
- **Results Display**: Comprehensive score and answer details
- **Toast Notifications**: Success/error feedback
- **Responsive Design**: Optimized for mobile devices

## Tech Stack

- **React Native** with Expo
- **TypeScript** for type safety
- **Expo Camera** for image capture
- **React Native Toast Message** for notifications
- **Expo Router** for navigation

## Project Structure

```
├── app/
│   ├── (tabs)/
│   │   └── scanner.tsx          # Scanner tab screen
│   └── _layout.tsx              # Root layout with Toast provider
├── components/
│   ├── scanner/
│   │   ├── CameraScanner.tsx    # Camera interface
│   │   ├── ScanResults.tsx      # Results display
│   │   └── ScannerScreen.tsx    # Main scanner screen
│   └── ui/
│       └── ToastConfig.tsx      # Toast configuration
├── services/
│   ├── scanningService.ts       # Image processing & OCR
│   └── gradingService.ts        # Answer grading logic
├── types/
│   └── scanning.ts              # TypeScript interfaces
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

## Usage

### For Instructors/Scanners

1. **Open Scanner Tab**: Navigate to the Scanner tab in the app
2. **Start Scanning**: Tap "Start Scanning" button
3. **Align Answer Sheet**: Position the answer sheet within the camera frame
4. **Capture**: Tap the capture button to scan the sheet
5. **View Results**: Review the grading results and student score
6. **Continue**: Scan additional sheets or close the scanner

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

- Image processing and OCR
- Bubble detection
- Student ID extraction

### Production Considerations

For production deployment:

1. **Computer Vision**: Integrate real image processing libraries
2. **Cloud Services**: Use OCR APIs for better accuracy
3. **Data Storage**: Implement proper data persistence
4. **Security**: Add authentication and data encryption
5. **Performance**: Optimize for various device capabilities

## API Integration Points

The app is designed with clear integration points for:

- **OCR Services**: Google Vision API, AWS Textract
- **Image Processing**: OpenCV, custom algorithms
- **Data Storage**: Firebase, REST APIs
- **Authentication**: User management systems

## Testing

Run the app in development mode to test:

- Camera functionality
- Mock scanning and grading
- UI interactions
- Toast notifications

## Contributing

1. Follow TypeScript best practices
2. Maintain component separation
3. Add proper error handling
4. Update documentation for new features

## License

This project is part of the SmartCheck mobile application system.

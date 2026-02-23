import { OpenCV, ObjectType, DataTypes } from "react-native-fast-opencv";
const laplacianMat = OpenCV.createObject(ObjectType.Mat, 0, 0, DataTypes.CV_8U);
// Just testing if we can do this without failing? Not easily in shell, it's a react native environment.

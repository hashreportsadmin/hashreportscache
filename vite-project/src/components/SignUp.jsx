import React from 'react';
import { ContactFooter } from './ContactFooter';
import { BackgroundShapes, CustomSelect, LogoHeader, Popup, ValidatedInput } from './SharedUI';
import { Welcome } from './Welcome';
import { dbCreateObject, dbListObjects } from '../utils/db';
import { formatEmail, formatFullName, formatPhone, formatRegNumber } from '../utils/formatters';

const SignUp = ({ onNavigate }) => {
    const [step, setStep] = React.useState(1);
    const [isRegRegistered, setIsRegRegistered] = React.useState(false);
    const [isCheckingReg, setIsCheckingReg] = React.useState(false);
    const [formData, setFormData] = React.useState({
        fullName: '', photo: null, photoUrl: '',
        university: '', course: '', regNumber: '',
        normalPhone: '', whatsappNumber: '', email: '',
        password: '', confirmPassword: ''
    });
    
    const [showPopup, setShowPopup] = React.useState(false);
    const [popupContent, setPopupContent] = React.useState({ title: '', message: '', type: 'info', icon: '' });
    const [isLoading, setIsLoading] = React.useState(false);
    const [scanState, setScanState] = React.useState('idle'); 
    const [tempPhoto, setTempPhoto] = React.useState(null);
    const fileInputRef = React.useRef(null);

    const universities = [
        "Select University", "University of Dodoma", "University of Dar-es-salaam", 
        "Mbeya University of Science and Technology", "Ardhi University", 
        "College of Business Education", "Institute of Accountancy Arusha", 
        "Muslim University of Morogoro", "Institute of Finance Management"
    ];

    const universityLogos = {
        "University of Dodoma": "https://app.trickle.so/storage/public/images/usr_1859567910000001/e442c661-c8dc-40b5-8f6d-2dc2e2497c18.jpeg",
        "University of Dar-es-salaam": "https://app.trickle.so/storage/public/images/usr_1859567910000001/13868d9c-b461-47e8-bf25-d41ce77a8f19.png",
        "Mbeya University of Science and Technology": "https://app.trickle.so/storage/public/images/usr_1859567910000001/f68117f8-0fe8-43bf-944c-ecbd607a6fba.png",
        "Ardhi University": "https://app.trickle.so/storage/public/images/usr_1859567910000001/da771815-2ef4-4107-b209-99b284b02294.jpeg",
        "College of Business Education": "https://app.trickle.so/storage/public/images/usr_1859567910000001/4629851f-b9cf-4554-8574-3359285dcfe6.png",
        "Institute of Accountancy Arusha": "https://app.trickle.so/storage/public/images/usr_1859567910000001/27226368-effa-494d-a50f-83a133f788f4.jpeg",
        "Muslim University of Morogoro": "https://app.trickle.so/storage/public/images/usr_1859567910000001/c5830541-b178-4ece-82ea-909dc67c12e6.png",
        "Institute of Finance Management": "https://app.trickle.so/storage/public/images/usr_1859567910000001/f7ec657c-7550-4aef-ab3f-43ac8ac27eaf.png"
    };

    const courses = [
        "Select Course",
        "Bachelor of Business Administration",
        "Bachelor of Commerce in Accounting",
        "Bachelor of Commerce in Finance",
        "Bachelor of Commerce in Procurement and Logistics Management",
        "Bachelor of Commerce in Human Resource Management",
        "Bachelor of Commerce in Marketing",
        "Bachelor of Commerce in Tourism and Hospitality Management",
        "Bachelor of Commerce in International Business",
        "Bachelor of Commerce in Enterpreneurship",
        "Bachelor of Commerce in Information Management",
        "Bachelor of Arts in Economics",
        "Bachelor of Arts in Economics and Statistics",
        "Bachelor of Arts in Economics and Sociology",
        "Bachelor of Arts in Environmental Economics and Policy"
    ];

    const triggerPopup = (title, message, type = 'info', icon = '') => {
        setPopupContent({ title, message, type, icon });
        setShowPopup(true);
    };

    const handleUniversityChange = (val) => {
        setFormData(prev => ({ ...prev, university: val, course: '' }));
        if (val && val !== "Select University" && val !== "University of Dodoma") {
            triggerPopup("Service Unavailable", `Ooops, we currently offer our services to University of Dodoma Students. Stay tuned for any updates upon our services in ${val}`, 'info', '⚠️');
            setTimeout(() => {
                setFormData(prev => ({ ...prev, university: "Select University" }));
            }, 100);
        }
    };

    const handlePhotoUploadClick = () => {
        triggerPopup("Profile Photo", "Make sure the profile photo you choose shows your face clearly so that it can be used to verify you in case of any inconveniences", "upload", '📸');
    };

    // Rotates the source image onto a canvas by the given angle, expanding the
    // canvas so nothing gets clipped at the corners. This is used ONLY to help
    // the detector find a face that's tilted/sideways/upside-down in the
    // photo - the resulting rotated canvas is never used for the final photo
    // itself, which is always cropped from the original, unrotated image (see
    // mapCanvasPointToOriginal below).
    const rotateImageToCanvas = (img, angleDegrees) => {
        const angleRad = (angleDegrees * Math.PI) / 180;
        const w = img.width, h = img.height;
        const cos = Math.abs(Math.cos(angleRad));
        const sin = Math.abs(Math.sin(angleRad));
        const newW = Math.round(w * cos + h * sin);
        const newH = Math.round(w * sin + h * cos);
        const canvas = document.createElement('canvas');
        canvas.width = newW;
        canvas.height = newH;
        const ctx = canvas.getContext('2d');
        ctx.translate(newW / 2, newH / 2);
        ctx.rotate(angleRad);
        ctx.drawImage(img, -w / 2, -h / 2);
        return canvas;
    };

    // Maps a point found on a rotated detection canvas back to its location
    // in the original, unrotated image, by applying the inverse rotation.
    // This lets us use whatever angle found the face purely for scanning,
    // while always cropping the final photo from the original image - so the
    // photo the user uploaded is never itself rotated.
    const mapCanvasPointToOriginal = (x, y, angleDegrees, canvasW, canvasH, origW, origH) => {
        const angleRad = (angleDegrees * Math.PI) / 180;
        const cos = Math.cos(-angleRad);
        const sin = Math.sin(-angleRad);
        const dx = x - canvasW / 2;
        const dy = y - canvasH / 2;
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;
        return { x: rx + origW / 2, y: ry + origH / 2 };
    };

    // A box detector can occasionally mistake a textured/blurry region for a
    // face. As a second, independent check, this verifies the 68-point facial
    // landmarks actually form a plausible human face layout (eyes spaced
    // proportionally to the face width, sitting in the upper part of the box)
    // rather than just trusting the detector's score on its own.
    const isPlausibleFace = (landmarks, box) => {
        if (!landmarks || !landmarks.positions || landmarks.positions.length < 68 || box.width <= 0 || box.height <= 0) {
            return false;
        }
        const positions = landmarks.positions;
        const avg = (pts) => ({
            x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
            y: pts.reduce((s, p) => s + p.y, 0) / pts.length
        });
        const leftEye = avg(positions.slice(36, 42));
        const rightEye = avg(positions.slice(42, 48));
        const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);

        // A real face's eye-to-eye distance sits within a fairly narrow band
        // relative to the detected face width.
        const eyeToFaceWidthRatio = eyeDist / box.width;
        if (eyeToFaceWidthRatio < 0.2 || eyeToFaceWidthRatio > 0.7) return false;

        // Eyes should land in roughly the upper-middle portion of the box, not
        // at the very top/bottom edge (which random landmark noise tends to do).
        const eyeY = (leftEye.y + rightEye.y) / 2;
        if (eyeY < box.y - box.height * 0.1 || eyeY > box.y + box.height * 0.8) return false;

        return true;
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setTempPhoto(reader.result);
                setScanState('scanning');
                
                const img = new Image();
                img.src = reader.result;
                img.onload = async () => {
                    try {
                        if (!faceapi.nets.tinyFaceDetector.isLoaded) {
                            await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/');
                        }
                        if (!faceapi.nets.faceLandmark68TinyNet.isLoaded) {
                            await faceapi.nets.faceLandmark68TinyNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/');
                        }

                        // A realistic confidence threshold for the box detector,
                        // so random background texture/blur doesn't easily pass.
                        const detectorOptions = new faceapi.TinyFaceDetectorOptions({
                            scoreThreshold: 0.7,
                            inputSize: 608
                        });

                        // Check the photo upright first (the common case), and
                        // only search rotated angles if that finds nothing - this
                        // handles tilted/sideways/upside-down photos without
                        // changing how a normal, already-upright photo behaves.
                        const anglesToTry = [0, -15, 15, -30, 30, -45, 45, -90, 90, 180];
                        let matchedAngle = null;
                        let matchedCanvas = null;
                        let plausibleFaces = [];

                        for (const angle of anglesToTry) {
                            const candidateCanvas = angle === 0 ? img : rotateImageToCanvas(img, angle);
                            const candidateWidth = angle === 0 ? img.width : candidateCanvas.width;
                            const candidateHeight = angle === 0 ? img.height : candidateCanvas.height;
                            // A real profile photo has the face as a meaningful part of
                            // the frame. This rejects a face that's just a small detail
                            // inside a much larger image (e.g. a poster, ID card graphic,
                            // or product photo with a tiny picture of a person on it).
                            const minFaceDimension = Math.min(candidateWidth, candidateHeight) * 0.10;
                            const results = await faceapi
                                .detectAllFaces(candidateCanvas, detectorOptions)
                                .withFaceLandmarks(true);
                            const plausible = results.filter(r =>
                                isPlausibleFace(r.landmarks, r.detection.box) &&
                                Math.max(r.detection.box.width, r.detection.box.height) >= minFaceDimension
                            );
                            if (plausible.length > 0) {
                                matchedAngle = angle;
                                matchedCanvas = candidateCanvas;
                                plausibleFaces = plausible;
                                break;
                            }
                        }

                        let mainFace = null;
                        let isMultiFace = false;

                        if (plausibleFaces.length > 0) {
                            // Sort by face area (largest first)
                            const sortedFaces = plausibleFaces
                                .map(r => r.detection.box)
                                .sort((a, b) => (b.width * b.height) - (a.width * a.height));
                            
                            mainFace = sortedFaces[0];

                            // Only consider it a multi-face error if the second face is nearly as large as the main face (>60% of the main face area)
                            // This drastically reduces false positives from background objects or blur being detected as faces
                            if (sortedFaces.length > 1) {
                                const mainArea = mainFace.width * mainFace.height;
                                const secondArea = sortedFaces[1].width * sortedFaces[1].height;
                                if (secondArea > mainArea * 0.6) {
                                    isMultiFace = true;
                                }
                            }
                        }

                        if (mainFace && !isMultiFace) {
                            // Always crop from the original, unrotated image. The
                            // rotated canvas (if any) was only used above to help
                            // the detector locate a tilted face - the photo itself
                            // is never rotated, so a tilted face stays tilted
                            // exactly as the user uploaded it.
                            const sourceImage = img;
                            const sourceWidth = img.width;
                            const sourceHeight = img.height;

                            const box = mainFace;
                            const rawCx = box.x + box.width / 2;
                            // Move center up a bit more to comfortably include the full head/hair
                            const rawCy = box.y + box.height / 2 - box.height * 0.18;
                            const matchedCanvasWidth = matchedAngle === 0 ? img.width : matchedCanvas.width;
                            const matchedCanvasHeight = matchedAngle === 0 ? img.height : matchedCanvas.height;
                            const { x: cx, y: cy } = matchedAngle === 0
                                ? { x: rawCx, y: rawCy }
                                : mapCanvasPointToOriginal(rawCx, rawCy, matchedAngle, matchedCanvasWidth, matchedCanvasHeight, sourceWidth, sourceHeight);
                            // Zoom in closer on the face so it reads clearly inside the circle
                            let size = Math.max(box.width, box.height) * 2.3;
                            size = Math.min(size, sourceWidth, sourceHeight);
                            let sx = cx - size / 2;
                            let sy = cy - size / 2;
                            
                            if (sx < 0) sx = 0;
                            if (sy < 0) sy = 0;
                            if (sx + size > sourceWidth) sx = sourceWidth - size;
                            if (sy + size > sourceHeight) sy = sourceHeight - size;
                            
                            const canvas = document.createElement('canvas');
                            canvas.width = size;
                            canvas.height = size;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(sourceImage, sx, sy, size, size, 0, 0, size, size);
                            const croppedPhotoUrl = canvas.toDataURL('image/jpeg', 0.9);

                            setScanState('success');
                            setTimeout(() => {
                                setFormData(prev => ({ ...prev, photoUrl: croppedPhotoUrl }));
                                setScanState('idle');
                                setTempPhoto(null);
                            }, 1500);
                        } else if (!mainFace) {
                            setScanState('no-face');
                        } else {
                            setScanState('multi-face');
                        }
                    } catch (error) {
                        console.error('Face detection error:', error);
                        setScanState('no-face');
                    }
                };
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRetryPhoto = () => {
        setScanState('idle');
        setTempPhoto(null);
        fileInputRef.current?.click();
    };

    // Validators
    const valName = (v) => {
        if (!v) return "Full Name is required";
        const words = v.trim().split(/\s+/);
        if (words.length < 3) return "Exactly 3 Names Required";
        if (words.length > 3) return "Exactly 3 Names Required";
        if (v.length <= 5) return "Name is too short";
        return null;
    };
    const valUni = (v) => (!v || v === "Select University" ? "Please select a university" : v !== "University of Dodoma" ? "Only UDOM is supported" : null);
    const valCourse = (v) => (!v || v === "Select Course" ? "Please select a course" : null);
    const valReg = (v) => {
        if (!v || v === 'T') return "Registration Number is required";
        if (v.length !== 12) return "Format: TXX-XX-XXXXX";
        return null;
    };
    const valPhone = (v) => (!v || v.length !== 13 ? "Format: +255XXXXXXXXX" : null);
    const valEmail = (v) => (!v || !v.endsWith('@gmail.com') ? "Must be a valid @gmail.com address" : null);
    const valPass = (v) => (!v || v.length <= 5 ? "Password must be at least 6 characters" : null);
    const valConfirm = (v) => {
        if (!v) return "Please confirm password";
        if (v !== formData.password) return "Passwords do not match";
        return null;
    };

    const handleRegChange = async (val) => {
        const formatted = formatRegNumber(val, formData.regNumber);
        setFormData(prev => ({...prev, regNumber: formatted}));
        
        if (formatted.length === 12) {
            setIsCheckingReg(true);
            try {
                const res = await dbListObjects('user', 1000, false);
                const exists = res.items.some(u => u.objectData.regNumber === formatted && !u.objectData.deleted);
                if (exists) {
                    setIsRegRegistered(true);
                    triggerPopup("Already Registered", "This Registration Number is Already Registered in Our System, Sign In to your Account with your Password", "exists", "🚨");
                } else {
                    setIsRegRegistered(false);
                    if (!valUni(formData.university) && formData.university === "University of Dodoma" && !valCourse(formData.course)) {
                        setTimeout(() => document.activeElement?.blur(), 100);
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsCheckingReg(false);
            }
        } else {
            setIsRegRegistered(false);
            setIsCheckingReg(false);
        }
    };

    const isStepValid = () => {
        switch(step) {
            case 1: return !valName(formData.fullName) && formData.photoUrl !== '';
            case 2: return !valUni(formData.university) && formData.university === "University of Dodoma" && !valCourse(formData.course) && !valReg(formData.regNumber) && !isRegRegistered && !isCheckingReg;
            case 3: return !valPhone(formData.normalPhone) && !valPhone(formData.whatsappNumber) && !valEmail(formData.email);
            case 4: return !valPass(formData.password) && !valConfirm(formData.confirmPassword);
            default: return true;
        }
    };

    // Removed automatic input blur effect to allow continuous typing

    const handleNext = () => {
        setIsLoading(true);
        setTimeout(() => {
            setIsLoading(false);
            setStep(prev => prev + 1);
        }, 400);
    };

    const handleRegister = async () => {
        setIsLoading(true);
        try {
            const { photo, confirmPassword, ...dbData } = formData;
            dbData.deleted = false; // Add required deleted flag for the user schema
            
            // Compress photoUrl to prevent payload too large errors on mobile devices
            if (dbData.photoUrl && dbData.photoUrl.startsWith('data:image')) {
                const compressedPhoto = await new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_SIZE = 400; // Resize to max 400px to keep payload small
                        let width = img.width;
                        let height = img.height;
                        if (width > height && width > MAX_SIZE) {
                            height *= MAX_SIZE / width;
                            width = MAX_SIZE;
                        } else if (height > MAX_SIZE) {
                            width *= MAX_SIZE / height;
                            height = MAX_SIZE;
                        } else {
                            resolve(dbData.photoUrl);
                            return;
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL('image/jpeg', 0.7));
                    };
                    img.onerror = () => resolve(dbData.photoUrl);
                    img.src = dbData.photoUrl;
                });
                dbData.photoUrl = compressedPhoto;
            }

            await dbCreateObject('user', dbData);
            
            // Keep in currentUser to maintain session
            localStorage.setItem('currentUser', JSON.stringify(dbData));
            
            triggerPopup("Welcome!", `Hellow ${formData.fullName.split(' ')[0]}, use your Registration Number and Password you created to Sign In to your Account. Once you Sign In you will be able to place an order for a Field Report or Research. Welcome to HashREPORTS.`, "welcome", "🎉");
        } catch (error) {
            console.error("Error creating user:", error);
            triggerPopup("Registration Failed", "There was an error creating your account. Please try again.", "error", "❌");
        } finally {
            setIsLoading(false);
        }
    };

    const closePopup = () => {
        const type = popupContent.type;
        setShowPopup(false);
        if (type === 'exists') {
            setFormData(prev => ({...prev, regNumber: 'T'}));
        }
    };

    const confirmPopup = () => {
        const type = popupContent.type;
        setShowPopup(false);
        if (type === 'welcome' || type === 'exists') {
            if (type === 'exists') {
                sessionStorage.setItem('prefillRegNumber', formData.regNumber);
            }
            onNavigate('signin');
        } else if (type === 'upload') {
            fileInputRef.current?.click();
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col p-4 md:p-6 relative overflow-hidden" data-name="signup" data-file="components/SignUp.js">
            <BackgroundShapes />
            
            {/* Hidden file input */}
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

            <div className={`w-full max-w-md md:max-w-4xl mx-auto relative z-10 flex flex-col md:flex-row md:items-start md:gap-8 pt-4 pb-6 md:pb-4 md:mt-8`}>
                
                {/* Left Side (PC) / Top (Mobile) */}
                <div className="md:w-1/2 flex flex-col justify-center md:sticky md:top-6 mb-6 md:mb-0">
                    <LogoHeader />
                    
                    <div className="hidden md:block mt-6 bg-white/70 backdrop-blur-md p-5 rounded-2xl border border-white shadow-sm">
                        <h3 className="text-lg font-bold text-gray-800 mb-2">Create Your Account</h3>
                        <p className="text-gray-600 text-sm leading-relaxed mb-4">
                            Join HashREPORTS today and easily manage your field and research reports. Follow the simple steps to set up your profile and get full access to the portal.
                        </p>
                        <div className="flex items-center gap-3 text-sm text-[var(--primary-dark)] font-medium">
                            <div className="icon-shield-check text-xl"></div> Secure & Fast Registration
                        </div>
                    </div>
                </div>
                
                {/* Right Side (PC) / Bottom (Mobile) */}
                <div className="md:w-1/2 flex flex-col items-center w-full">
                <div className="glass-card w-full max-w-[420px] p-4 md:p-5 flex flex-col mb-2 md:mb-0 shadow-2xl h-fit transition-all duration-300">
                    <div className="flex items-center justify-start gap-2 mb-4 md:mb-4">
                        <div className="icon-user-plus text-xl md:text-2xl text-[var(--primary-color)]"></div>
                        <h1 className="text-xl md:text-2xl font-bold text-[var(--primary-color)]">Sign Up</h1>
                    </div>

                    <div className="flex items-center justify-between w-full mb-4 md:mb-6 relative px-2">
                        <div className="absolute top-4 left-0 w-full h-[2px] bg-gray-200 z-0"></div>
                        <div className="absolute top-4 left-0 h-[2px] bg-green-500 z-0 transition-all duration-500" style={{ width: `${((step - 1) / 4) * 100}%` }}></div>
                        {['Identity', 'Academic', 'Contact', 'Security', 'Confirm'].map((label, i) => {
                            const isCompleted = i + 1 < step;
                            const isCurrent = i + 1 === step;
                            return (
                                <div key={i} className="relative z-10 flex flex-col items-center w-14">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${isCompleted ? 'bg-green-500 border-green-500 text-white' : isCurrent ? 'bg-white border-[var(--primary-color)] text-[var(--primary-color)]' : 'bg-white border-gray-300 text-gray-300'}`}>
                                        {isCompleted ? <div className="icon-check text-sm font-bold text-white"></div> : <span className="text-xs font-bold">{i + 1}</span>}
                                    </div>
                                    <span className={`text-[10px] mt-1 font-medium text-center w-full ${isCurrent ? 'text-[var(--primary-color)]' : isCompleted ? 'text-green-600' : 'text-gray-400'}`}>{label}</span>
                                </div>
                            )
                        })}
                    </div>

                    <div className="mb-4">
                        {step === 1 && (
                            <div className="animate-fade-in">
                                <h2 className="text-base md:text-lg font-bold mb-3 md:mb-4 text-[var(--primary-color)] text-center">Identity Information</h2>
                                <div className="space-y-3">
                                    <ValidatedInput 
                                        label="Full Name" 
                                        placeholder="FIRST MIDDLE LAST"
                                        value={formData.fullName}
                                        autoComplete="name"
                                        onChange={(e) => setFormData({...formData, fullName: formatFullName(e.target.value)})}
                                        validate={valName}
                                    />
                                    <div>
                                        <label className="form-label">Profile Photo</label>
                                        <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${formData.photoUrl ? 'border-green-500 bg-green-50' : 'border-[var(--primary-color)]/30 bg-[var(--primary-light)]/30 hover:border-[var(--primary-color)]'}`}
                                            onClick={handlePhotoUploadClick}>
                                            {formData.photoUrl ? (
                                                <div className="flex flex-col items-center">
                                                    <div className="relative w-24 h-24 mb-3">
                                                        <img src={formData.photoUrl} className="w-full h-full object-cover object-center rounded-full border-4 border-white shadow-md" alt="Profile" />
                                                        <div className="absolute bottom-0 right-0 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center border-2 border-white">
                                                            <div className="icon-check text-xs"></div>
                                                        </div>
                                                    </div>
                                                    <span className="font-medium text-green-700 text-sm">Click here to change profile photo</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="icon-image text-3xl text-[var(--primary-color)] mb-2"></div>
                                                    <span className="font-medium text-[var(--primary-dark)]">Tap to upload photo</span>
                                                </>
                                            )}
                                        </div>
                                        {!formData.photoUrl && step === 1 && <p className="text-red-500 text-xs mt-1.5 ml-1 hidden group-hover:block">Profile photo is required</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="animate-fade-in">
                                <h2 className="text-base md:text-lg font-bold mb-3 md:mb-4 text-[var(--primary-color)] text-center">Academic Information</h2>
                                <div className="space-y-3">
                                    <div>
                                        <label className="form-label">University</label>
                                        <CustomSelect 
                                            options={universities.filter(u => u !== "Select University")}
                                            value={formData.university}
                                            placeholder="Select University"
                                            onChange={handleUniversityChange}
                                            error={valUni(formData.university)}
                                            optionIcons={universityLogos}
                                        />
                                    </div>
                                    {formData.university === "University of Dodoma" && (
                                        <div className="animate-fade-in space-y-4">
                                            <div>
                                                <label className="form-label">Course</label>
                                                <CustomSelect 
                                                    options={courses.filter(c => c !== "Select Course")}
                                                    value={formData.course}
                                                    placeholder="Select Course"
                                                    onChange={(val) => setFormData(prev => ({...prev, course: val}))}
                                                    error={valCourse(formData.course)}
                                                />
                                            </div>
                                            <ValidatedInput 
                                                label="Registration Number" 
                                                placeholder="TXX-XX-XXXXX"
                                                className="tracking-wider"
                                                value={formData.regNumber}
                                                onClick={(e) => {
                                                    if (!formData.regNumber) setFormData({...formData, regNumber: 'T'});
                                                    setTimeout(() => {
                                                        const target = e.target;
                                                        target.setSelectionRange(target.value.length, target.value.length);
                                                    }, 10);
                                                }}
                                                onKeyUp={(e) => {
                                                    const valLen = e.target.value.length;
                                                    e.target.setSelectionRange(valLen, valLen);
                                                }}
                                                onChange={(e) => handleRegChange(e.target.value)}
                                                validate={valReg}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="animate-fade-in">
                                <h2 className="text-base md:text-lg font-bold mb-3 md:mb-4 text-[var(--primary-color)] text-center">Contact Information</h2>
                                <div className="space-y-3 md:space-y-4">
                                    <ValidatedInput 
                                        id="signup-phone"
                                        label="Normal Calls Number" 
                                        placeholder="+255XXXXXXXXX"
                                        className=""
                                        value={formData.normalPhone}
                                        autoComplete="off"
                                        onClick={() => !formData.normalPhone && setFormData({...formData, normalPhone: '+255'})}
                                        onChange={(e) => {
                                            const formatted = formatPhone(e.target.value);
                                            setFormData(prev => {
                                                const nextState = { ...prev, normalPhone: formatted };
                                                if (formatted.length === 13 && !valPhone(formatted) && !nextState.whatsappNumber) {
                                                    nextState.whatsappNumber = '+255';
                                                }
                                                return nextState;
                                            });
                                            if (formatted.length === 13 && !valPhone(formatted)) {
                                                setTimeout(() => document.getElementById('signup-whatsapp')?.focus(), 50);
                                            }
                                        }}
                                        validate={valPhone}
                                    />
                                    <ValidatedInput 
                                        id="signup-whatsapp"
                                        label="WhatsApp Number" 
                                        placeholder="+255XXXXXXXXX"
                                        className=""
                                        value={formData.whatsappNumber}
                                        autoComplete="off"
                                        onClick={() => !formData.whatsappNumber && setFormData({...formData, whatsappNumber: '+255'})}
                                        onChange={(e) => {
                                            const formatted = formatPhone(e.target.value);
                                            setFormData({...formData, whatsappNumber: formatted});
                                            if (formatted.length === 13 && !valPhone(formatted)) {
                                                setTimeout(() => document.getElementById('signup-email')?.focus(), 50);
                                            }
                                        }}
                                        validate={valPhone}
                                    />
                                    <ValidatedInput 
                                        id="signup-email"
                                        label="Email Address" 
                                        placeholder="yourname@gmail.com"
                                        value={formData.email}
                                        autoComplete="email"
                                        onChange={(e) => {
                                            const formattedEmail = formatEmail(e.target.value, formData.email);
                                            setFormData({...formData, email: formattedEmail});
                                            if (!valEmail(formattedEmail) && !valPhone(formData.normalPhone) && !valPhone(formData.whatsappNumber)) {
                                                setTimeout(() => document.activeElement?.blur(), 100);
                                            }
                                        }}
                                        validate={valEmail}
                                    />
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="animate-fade-in">
                                <h2 className="text-base md:text-lg font-bold mb-3 md:mb-4 text-[var(--primary-color)] text-center">Security Information</h2>
                                <div className="space-y-3 md:space-y-4">
                                    <ValidatedInput 
                                        label="Password" 
                                        placeholder="Enter password"
                                        type="password"
                                        showEye={true}
                                        autoComplete="new-password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                                        validate={valPass}
                                    />
                                    <ValidatedInput 
                                        label="Confirm Password" 
                                        placeholder="Confirm your password"
                                        type="password"
                                        showEye={true}
                                        autoComplete="new-password"
                                        value={formData.confirmPassword}
                                        onChange={(e) => {
                                            setFormData({...formData, confirmPassword: e.target.value});
                                            if (e.target.value === formData.password && !valPass(formData.password)) {
                                                setTimeout(() => document.activeElement?.blur(), 100);
                                            }
                                        }}
                                        validate={valConfirm}
                                    />
                                </div>
                            </div>
                        )}

                        {step === 5 && (
                            <div className="animate-fade-in flex flex-col">
                                <h2 className="text-lg font-bold mb-4 text-center text-[var(--primary-color)]">Confirmation & Approval</h2>
                                <div className="bg-white/60 border border-[var(--primary-light)] rounded-xl p-3 space-y-2 shadow-inner text-sm max-h-[300px] overflow-y-auto">
                                    <div className="flex justify-center mb-1">
                                        <div className="relative w-16 h-16">
                                            <img src={formData.photoUrl} className="w-full h-full object-cover rounded-full border-2 border-[var(--primary-color)] shadow-sm" alt="Profile" />
                                            <div className="absolute bottom-0 right-0 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
                                                <div className="icon-check text-[10px]"></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-100 pb-1">
                                        <span className="text-gray-500">Name</span>
                                        <span className="font-semibold text-gray-900 text-right">{formData.fullName}</span>
                                    </div>
                                    <div className="flex justify-between items-start gap-4 border-b border-gray-100 pb-1">
                                        <span className="text-gray-500 whitespace-nowrap">Course</span>
                                        <span className="font-semibold text-gray-900 text-right break-words">{formData.course}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-100 pb-1">
                                        <span className="text-gray-500">Reg No</span>
                                        <span className="font-semibold text-gray-900">{formData.regNumber}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-100 pb-1">
                                        <span className="text-gray-500">Phone</span>
                                        <span className="font-semibold text-gray-900">{formData.normalPhone}</span>
                                    </div>
                                    <div className="flex justify-between items-start gap-4 pb-1">
                                        <span className="text-gray-500 whitespace-nowrap">Email</span>
                                        <span className="font-semibold text-gray-900 text-right break-all">{formData.email}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-4">
                        <div className="flex gap-3">
                            {step > 1 && (
                                <button onClick={() => setStep(prev => prev - 1)} disabled={isLoading} className="btn-outline w-1/3">
                                    BACK
                                </button>
                            )}
                            {step < 5 ? (
                                <button onClick={handleNext} disabled={!isStepValid() || isLoading} className={`btn-primary shadow-md shadow-[var(--primary-light)] ${step > 1 ? 'w-2/3' : 'w-full'}`}>
                                    {isLoading ? <div className="icon-loader animate-spin mr-2"></div> : null}
                                    NEXT STEP
                                </button>
                            ) : (
                                <button onClick={handleRegister} disabled={isLoading} className="btn-primary w-2/3 shadow-lg shadow-[var(--primary-light)] bg-green-600 hover:bg-green-700 border-none">
                                    {isLoading ? <div className="icon-loader animate-spin mr-2"></div> : null}
                                    REGISTER
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 text-center">
                        <p className="text-gray-600 font-medium text-sm">
                            Already have an Account? <button onClick={() => onNavigate('signin')} className="font-bold text-[var(--primary-color)] hover:text-[var(--primary-dark)] transition-colors ml-1">Sign In</button>
                        </p>
                    </div>
                </div>
                {step === 1 && <div className="-mt-1 md:mt-4 w-full max-w-[420px]"><ContactFooter /></div>}
                </div>
            </div>

            <Popup 
                isOpen={showPopup} 
                title={popupContent.title} 
                message={popupContent.message}
                icon={popupContent.icon}
                onConfirm={confirmPopup} 
                confirmText={popupContent.type === 'exists' ? 'SIGN IN' : popupContent.type === 'upload' ? 'UPLOAD PHOTO' : 'OKAY'}
                onCancel={popupContent.type === 'exists' ? closePopup : undefined}
                cancelText="CANCEL"
            />

            {scanState !== 'idle' && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 animate-fade-in">
                    <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
                        
                        {scanState === 'scanning' && (
                            <>
                                <h3 className="text-xl font-bold text-gray-900 mb-2">Scanning Photo</h3>
                                <p className="text-gray-500 mb-6 text-sm">Analyzing image for facial recognition...</p>
                                
                                <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-blue-100 mb-4">
                                    <img src={tempPhoto} alt="Scanning" className="w-full h-full object-cover object-center opacity-70" />
                                    {/* Scanning line animation */}
                                    <div className="absolute top-0 left-0 w-full h-1 bg-[var(--primary-color)] shadow-[0_0_15px_rgba(0,119,190,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
                                </div>
                            </>
                        )}

                        {scanState === 'success' && (
                            <>
                                <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-4 scale-in">
                                    <div className="icon-check text-4xl"></div>
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-2">Face Successfully Recognized</h3>
                                <p className="text-gray-500 text-sm">Validating your profile picture...</p>
                            </>
                        )}

                        {(scanState === 'no-face' || scanState === 'multi-face') && (
                            <>
                                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
                                    <div className="icon-circle-alert text-4xl"></div>
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-2">Verification Failed</h3>
                                <p className="text-gray-600 mb-6 text-sm leading-relaxed">
                                    {scanState === 'no-face' 
                                        ? "Sorry, we could not find any face on the uploaded image. Please choose a clear image with your face." 
                                        : "Sorry, we detected multiple faces on the uploaded image. Please choose a clear image with one face."}
                                </p>
                                <button onClick={handleRetryPhoto} className="btn-primary w-full bg-[var(--primary-color)]">
                                    CHOOSE ANOTHER PHOTO
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
            
            <style>{`
                @keyframes scan {
                    0% { top: -10%; }
                    50% { top: 100%; }
                    100% { top: -10%; }
                }
                .scale-in { animation: scaleIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
                @keyframes scaleIn {
                    0% { transform: scale(0); }
                    100% { transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

export { SignUp };
export default SignUp;

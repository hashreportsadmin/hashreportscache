import React from 'react';
import { Popup } from './SharedUI';
import { calculateOrderProgress, dbCreateObject, dbListObjectsByField, dbUpdateObject } from '../utils/db';

const orderProgressStepsData = [
    { title: "Uploading Logbook", subSteps: ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"] },
    { title: "My Supervisors", subSteps: ["Internal FIELD Supervisor", "External UDOM Supervisor"] },
    { title: "Cover Page", subSteps: ["Logo", "University Details", "Field Details", "Student Details"] },
    { title: "Declaration", subSteps: ["Introduction", "Main Body", "Signature Part"] },
    { title: "Acknowledgement", subSteps: ["Organization", "Internal FIELD Supervisor", "External UDOM Supervisor", "Overall"] },
    { title: "Executive Summary", subSteps: ["Introduction", "Main Body", "Conclusion"] },
    { title: "Table of Contents", subSteps: ["Chapter One: Introduction", "Chapter Two: Description and Analysis", "Chapter Three: Problem Identification", "Chapter Four: Discussion", "Chapter Five: Conclusion and Recommendations", "References", "Appendices"] },
    { title: "List of Abbreviations", subSteps: ["Abbreviations"] },
    { title: "List of Figures", subSteps: ["Organizational Structure"] },
    { title: "Chapter One: Introduction", subSteps: ["Back ground of the Organization", "Vision Statement", "Mission statement", "Organizational Slogan/Motto", "Organizational core Values", "Organizational Objectives", "Organizational core Activities and Services", "Organizational clients", "Organization Structure & Departments"] },
    { title: "Chapter Two: Description and Analysis", subSteps: ["Sections and Departments", "In office and Out Office Activities", "Individual and Group Activities"] },
    { title: "Chapter Three: Problem Identification", subSteps: ["Organizational Problems/ Challenges", "Personal Problems/ Challenges", "Personal Efforts to Address"] },
    { title: "Chapter Four: Discussion", subSteps: ["Relevance of Field and Class", "New Skills Acquired"] },
    { title: "Chapter Five: Conclusion and Recommendations", subSteps: ["Conclusion", "Recommendations to Organization", "Recommendations to UDOM"] },
    { title: "References", subSteps: ["Primary References", "Secondary References", "Tertiary References"] },
    { title: "Appendices", subSteps: ["Informed Consent"] },
    { title: "Uploading Your Complete Report", subSteps: ["Complete Field Report"] }
];

const getStepIcon = (title) => {
    if(title.includes('Uploading Your Complete Report')) return 'cloud-upload';
    if(title.includes('Logbook')) return 'book';
    if(title.includes('Supervisors')) return 'users';
    if(title.includes('Cover Page')) return 'image';
    if(title.includes('Declaration')) return 'file-check';
    if(title.includes('Acknowledgement')) return 'thumbs-up';
    if(title.includes('Summary')) return 'file-text';
    if(title.includes('Table')) return 'list';
    if(title.includes('Abbreviations')) return 'type';
    if(title.includes('Figures')) return 'image';
    if(title.includes('Chapter')) return 'folder-open';
    if(title.includes('References')) return 'link';
    if(title.includes('Appendices')) return 'paperclip';
    return 'file';
};

// --- Logbook cache helpers ---------------------------------------------
// Logbooks are stored in localStorage (not sessionStorage) so the cache
// survives closing the browser and signing back in later, not just the
// current tab session.
const LOGBOOK_CACHE_PREFIX = 'cached_logbooks_';

const readLogbookCache = (orderId) => {
    if (!orderId) return null;
    try {
        const raw = localStorage.getItem(`${LOGBOOK_CACHE_PREFIX}${orderId}`);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
};

const writeLogbookCache = (orderId, logs) => {
    if (!orderId) return;
    try {
        localStorage.setItem(`${LOGBOOK_CACHE_PREFIX}${orderId}`, JSON.stringify(logs));
    } catch (e) {}
};

// A logbook week is "final" once it's been digitized - the backend will
// never change it again after that. Once every required week has reached
// that final state, the cached copy can be trusted forever, so we can stop
// hitting the database for this order altogether.
const areLogbooksComplete = (logs, weekLabels) => {
    if (!Array.isArray(logs) || logs.length === 0) return false;
    return weekLabels.every(week => {
        const log = logs.find(l => l.objectData.week === week);
        return log && String(log.objectData.logbookStatus).toLowerCase() === 'digitized';
    });
};

// Logbooks are only re-synced with the database once per calendar week for
// weeks that are already fully resolved - specifically on the first login
// of each Saturday. Any week still pending ("ADMIN IS VERIFYING") is
// checked every time the tracking screen opens instead, regardless of day
// (see the effect below). Every other case is served purely from the
// permanent cache, with no database call at all.
const LOGBOOK_SYNC_DATE_PREFIX = 'logbook_last_sync_';

const readLastSyncDate = (orderId) => {
    if (!orderId) return null;
    try {
        return localStorage.getItem(`${LOGBOOK_SYNC_DATE_PREFIX}${orderId}`);
    } catch (e) {
        return null;
    }
};

const writeLastSyncDate = (orderId, dateStr) => {
    if (!orderId) return;
    try {
        localStorage.setItem(`${LOGBOOK_SYNC_DATE_PREFIX}${orderId}`, dateStr);
    } catch (e) {}
};

const OrderProgress = ({ order, user, onBack, getOrderNumber, onPayClick, initialExpandedStep = null, skipAnimations = false }) => {
    const [expandedStep, setExpandedStep] = React.useState(initialExpandedStep);
    const [downloadState, setDownloadState] = React.useState('idle');
    const [logbooks, setLogbooks] = React.useState(() => readLogbookCache(order?.objectId) || []);
    
    // Scanner States
    const [scannerPhase, setScannerPhase] = React.useState('idle'); // 'idle', 'info', 'camera', 'confirm_upload', 'viewing'
    const [cameraReady, setCameraReady] = React.useState(false);
    const [activeWeek, setActiveWeek] = React.useState(null);
    const [capturedImage, setCapturedImage] = React.useState(null);
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [isFlashing, setIsFlashing] = React.useState(false);
    const videoRef = React.useRef(null);
    const streamRef = React.useRef(null);

    const [initialLoadDone, setInitialLoadDone] = React.useState(false);
    // True only while genuinely fetching for the very first time ever (no
    // cached logbook data exists at all yet) - used to dim/disable the
    // per-week buttons until there's real data to act on.
    const [isInitialFetching, setIsInitialFetching] = React.useState(() => readLogbookCache(order?.objectId) === null);
    const [hasAnimated, setHasAnimated] = React.useState(false);
    const [showReminder, setShowReminder] = React.useState(false);
    const [isAnimatingSequence, setIsAnimatingSequence] = React.useState(false);

    // Ensure it scrolls to top when opened
    React.useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'auto' });
    }, []);

    // Prevent scrolling when sequence is animating
    React.useEffect(() => {
        if (isAnimatingSequence) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, [isAnimatingSequence]);

    // Supervisor Modal State
    const [supervisorModal, setSupervisorModal] = React.useState({ isOpen: false, type: null, name: '', position: '' });
    const [isSavingSupervisor, setIsSavingSupervisor] = React.useState(false);
    const [isInputFocused, setIsInputFocused] = React.useState(false);

    React.useEffect(() => {
        const handleResize = () => {
            if (window.visualViewport) {
                // If visual viewport height is close to window innerHeight, keyboard is likely closed
                if (window.innerHeight - window.visualViewport.height < 100) {
                    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                        document.activeElement.blur();
                    }
                }
            }
        };

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleResize);
        }
        return () => {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', handleResize);
            }
        };
    }, []);

    const safeParseSupervisor = (data) => {
        if (!data) return null;
        if (typeof data === 'object') return data;
        try {
            return JSON.parse(data.replace(/&quot;/g, '"'));
        } catch (e) {
            console.error("Failed to parse supervisor data:", e);
            return null;
        }
    };

    const [localSupervisors, setLocalSupervisors] = React.useState({
        internal: safeParseSupervisor(order.objectData?.internalSupervisor),
        external: safeParseSupervisor(order.objectData?.externalSupervisor)
    });

    React.useEffect(() => {
        setLocalSupervisors({
            internal: safeParseSupervisor(order.objectData?.internalSupervisor),
            external: safeParseSupervisor(order.objectData?.externalSupervisor)
        });
    }, [order.objectData?.internalSupervisor, order.objectData?.externalSupervisor]);

    const handleSupervisorSave = async () => {
        setIsSavingSupervisor(true);
        const existingSup = localSupervisors[supervisorModal.type === 'Internal FIELD Supervisor' ? 'internal' : 'external'];
        const isChanging = !!existingSup;

        const field = supervisorModal.type === 'Internal FIELD Supervisor' ? 'internalSupervisor' : 'externalSupervisor';
        const updatedData = { ...order.objectData };
        const supData = { name: supervisorModal.name.toUpperCase(), position: supervisorModal.position.toUpperCase() };
        updatedData[field] = JSON.stringify(supData);
        
        if (isChanging) {
            if (supervisorModal.type === 'Internal FIELD Supervisor') {
                updatedData.internalSupervisorChanged = true;
            } else {
                updatedData.externalSupervisorChanged = true;
            }
        }
        
        // Update progress state to mark this step as completed while retaining all other progress
        let currentProg = JSON.parse(JSON.stringify(progress));
        if (!currentProg["My Supervisors"]) currentProg["My Supervisors"] = {};
        currentProg["My Supervisors"][supervisorModal.type] = true;
        updatedData.progress = JSON.stringify(currentProg);
        
        // Optimistic update
        setLocalSupervisors(prev => ({
            ...prev,
            [supervisorModal.type === 'Internal FIELD Supervisor' ? 'internal' : 'external']: supData
        }));

        try {
            await dbUpdateObject('field_report_order', order.objectId, updatedData);
            
            await dbCreateObject('notification', {
                regNumber: user.regNumber,
                title: 'Supervisor Added',
                message: `You have successfully added ${supData.name} as your ${supervisorModal.type}.`,
                isRead: false,
                icon: 'user-plus'
            });
        } catch (e) {
            console.error("Failed to save supervisor", e);
        }
        setIsSavingSupervisor(false);
        setSupervisorModal({ isOpen: false, type: null, name: '', position: '' });
    };

    const isSupervisorValid = () => {
        const nameValid = supervisorModal.name.trim().length >= 3;
        const posValid = supervisorModal.position.trim().length >= 2;
        
        const existingSup = localSupervisors[supervisorModal.type === 'Internal FIELD Supervisor' ? 'internal' : 'external'];
        
        let hasChanges = true;
        if (existingSup) {
            hasChanges = existingSup.name !== supervisorModal.name.trim().toUpperCase() || 
                         existingSup.position !== supervisorModal.position.trim().toUpperCase();
        }

        return nameValid && posValid && hasChanges;
    };

    React.useEffect(() => {
        let isMounted = true;
        const weekLabels = orderProgressStepsData[0].subSteps;

        // Fetches the latest logbook data and merges it in, but treats any
        // week that's already digitized in the cache as permanently final -
        // it's never overwritten again, even by a fresh response. Only
        // still-pending weeks ("ADMIN IS VERIFYING") actually get updated.
        const fetchLogbooks = async () => {
            try {
                const res = await dbListObjectsByField('logbook', 'orderId', order.objectId, 10, true);
                if (!isMounted) return;
                const freshLogs = res.items;
                setLogbooks(prevLogs => {
                    const merged = weekLabels
                        .map(week => {
                            const prevLog = prevLogs.find(l => l.objectData.week === week);
                            const prevDigitized = prevLog && String(prevLog.objectData.logbookStatus).toLowerCase() === 'digitized';
                            if (prevDigitized) return prevLog;
                            return freshLogs.find(l => l.objectData.week === week) || prevLog;
                        })
                        .filter(Boolean);
                    writeLogbookCache(order.objectId, merged);
                    return merged;
                });
                writeLastSyncDate(order.objectId, new Date().toISOString().slice(0, 10));
            } catch (e) {
                console.error("Failed to fetch logbooks", e);
            } finally {
                if (isMounted) {
                    setInitialLoadDone(true);
                    setIsInitialFetching(false);
                }
            }
        };

        // A cache that has never been written is `null`; an order with zero
        // logbooks uploaded yet but that has already been checked once is a
        // real (possibly empty) cached array - the two are not the same.
        const cachedRaw = readLogbookCache(order.objectId);
        const hasSyncedBefore = cachedRaw !== null;
        const cached = cachedRaw || [];
        const complete = areLogbooksComplete(cached, weekLabels);

        if (complete) {
            // Every week is already digitized - nothing can ever change
            // again, so stay on the permanent cache forever.
            setInitialLoadDone(true);
            setIsInitialFetching(false);
            return () => { isMounted = false; };
        }

        if (!hasSyncedBefore) {
            // First time this order's logbooks have ever been viewed -
            // there's nothing cached yet, so a fetch is unavoidable. The
            // per-week buttons dim/disable (via isInitialFetching) until
            // this resolves.
            setIsInitialFetching(true);
            fetchLogbooks();
            return () => { isMounted = false; };
        }

        setInitialLoadDone(true);
        setIsInitialFetching(false);

        const hasPending = cached.some(l => String(l.objectData.logbookStatus).toLowerCase() !== 'digitized');
        if (hasPending) {
            // At least one week is still "ADMIN IS VERIFYING" - check its
            // status every single time the tracking screen is opened,
            // regardless of the day, so a newly digitized week shows up
            // right away without waiting for Saturday.
            fetchLogbooks();
        } else {
            // Nothing pending right now - only do the weekly safety sync on
            // the first login of each Saturday; every other day this is
            // served purely from cache with no network call at all.
            const todayStr = new Date().toISOString().slice(0, 10);
            const isSaturday = new Date().getDay() === 6;
            if (isSaturday && readLastSyncDate(order.objectId) !== todayStr) {
                fetchLogbooks();
            }
        }

        return () => { isMounted = false; };
    }, [order.objectId]);
    
    React.useEffect(() => {
        if (initialLoadDone && !hasAnimated) {
            setHasAnimated(true);
            
            const hasNoLogs = logbooks.length === 0;
            const hasNoSups = !localSupervisors.internal && !localSupervisors.external;
            
            if (!skipAnimations && initialExpandedStep === null && hasNoLogs && hasNoSups) {
                setIsAnimatingSequence(true);
                setShowReminder(true);
                
                setTimeout(() => {
                    setShowReminder(false);
                    
                    setTimeout(() => {
                        setExpandedStep(0); // Open Logbooks
                        
                        setTimeout(() => {
                            setExpandedStep(null); // Close Logbooks
                            
                            setTimeout(() => {
                                setExpandedStep(1); // Open Supervisors
                                
                                setTimeout(() => {
                                    setExpandedStep(null); // Close Supervisors
                                    
                                    setTimeout(() => {
                                        setIsAnimatingSequence(false); // End sequence
                                    }, 500);
                                }, 1500); // Time Supervisors stays open
                                
                            }, 1500); // Time to wait for Logbooks to close (1.5 seconds)
                            
                        }, 1500); // Time Logbooks stays open
                    }, 400);
                    
                }, 10000);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialLoadDone]);

    const progress = React.useMemo(() => {
        if (order.objectData?.progress) {
            try {
                let progStr = typeof order.objectData.progress === 'string' 
                    ? order.objectData.progress 
                    : JSON.stringify(order.objectData.progress);
                progStr = progStr.replace(/&quot;/g, '"');
                return JSON.parse(progStr);
            } catch (e) {
                console.error("Failed to parse progress", e);
            }
        }
        const initial = {};
        orderProgressStepsData.forEach((step) => {
            initial[step.title] = {};
            step.subSteps.forEach(sub => initial[step.title][sub] = false);
        });
        return initial;
    }, [order.objectData?.progress]);

    const getStepStatus = (stepTitle, subSteps) => {
        if (stepTitle === "Uploading Your Complete Report") {
            if (order.objectData?.settled && order.objectData?.reportPdfUrl) return 'Completed';
            if (order.objectData?.settled && !order.objectData?.reportPdfUrl) return 'In Progress';
            return 'Pending';
        }

        let completedCount = 0;
        let processingCount = 0;
        
        if (stepTitle === "Uploading Logbook") {
            subSteps.forEach(sub => {
                const log = logbooks.find(l => l.objectData.week === sub);
                if (log) {
                    if (String(log.objectData.logbookStatus).toLowerCase() === 'digitized') {
                        completedCount++;
                    } else {
                        processingCount++;
                    }
                }
            });
        } else if (stepTitle === "My Supervisors") {
            completedCount = subSteps.filter(sub => {
                if (sub === 'Internal FIELD Supervisor') return !!localSupervisors.internal;
                if (sub === 'External UDOM Supervisor') return !!localSupervisors.external;
                return false;
            }).length;
        } else {
            completedCount = subSteps.filter(sub => progress[stepTitle] && progress[stepTitle][sub]).length;
        }
        
        if (completedCount === subSteps.length) return 'Completed';
        if (completedCount > 0 || processingCount > 0) return 'In Progress';
        return 'Pending';
    };

    const statusConfig = {
        'Completed': { bg: 'bg-green-100', text: 'text-green-600', iconBg: 'bg-green-500 text-white' },
        'In Progress': { bg: 'bg-yellow-100', text: 'text-yellow-700', iconBg: 'bg-yellow-500 text-white' },
        'Pending': { bg: 'bg-red-100', text: 'text-red-600', iconBg: 'bg-red-500 text-white' }
    };

    const handleDownload = () => {
        if (order.objectData?.settled && order.objectData?.reportPdfUrl) {
            setDownloadState('downloading');
            setTimeout(() => {
                setDownloadState('success');
                const link = document.createElement('a');
                link.href = order.objectData.reportPdfUrl;
                link.download = `${(user.fullName || 'STUDENT').split(' ')[0].toUpperCase()}'S REPORT.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => setDownloadState('idle'), 2500);
            }, 1500);
        } else {
            setDownloadState('error');
            setTimeout(() => setDownloadState('idle'), 3000);
        }
    };

    const getProgressInfo = () => {
        return calculateOrderProgress(order.objectData, order.objectId, logbooks);
    };

    const startUpload = (week) => {
        setActiveWeek(week);
        setScannerPhase('info');
    };

    const guideRef = React.useRef(null);
    const videoContainerRef = React.useRef(null);

    const startCamera = async () => {
        setScannerPhase('camera');
        setCameraReady(false);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 4096 },
                    height: { ideal: 2160 },
                    advanced: [{ focusMode: "continuous" }]
                } 
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    setCameraReady(true);
                };
            }
            streamRef.current = stream;
        } catch (err) {
            console.error("Camera access denied or unavailable", err);
            setCameraReady(true);
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };

    const playShutterSound = () => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // First click (Mirror up)
            const osc1 = audioCtx.createOscillator();
            const gain1 = audioCtx.createGain();
            osc1.type = 'square';
            osc1.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc1.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.05);
            gain1.gain.setValueAtTime(1, audioCtx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
            osc1.connect(gain1);
            gain1.connect(audioCtx.destination);
            osc1.start(audioCtx.currentTime);
            osc1.stop(audioCtx.currentTime + 0.05);

            // Shutter noise (mechanical movement)
            const bufferSize = audioCtx.sampleRate * 0.1;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            
            const noiseFilter = audioCtx.createBiquadFilter();
            noiseFilter.type = 'highpass';
            noiseFilter.frequency.value = 1000;
            
            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(audioCtx.destination);
            noise.start(audioCtx.currentTime);

            // Second click (Mirror down)
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(600, audioCtx.currentTime + 0.1);
            osc2.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.15);
            gain2.gain.setValueAtTime(0, audioCtx.currentTime);
            gain2.gain.setValueAtTime(1, audioCtx.currentTime + 0.1);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.start(audioCtx.currentTime + 0.1);
            osc2.stop(audioCtx.currentTime + 0.15);
            
        } catch(e) {
            console.error("Audio not supported");
        }
    };

    const takePicture = async () => {
        playShutterSound();
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 150);

        let imageSrc = '';
        if (videoRef.current && guideRef.current && videoContainerRef.current) {
            const video = videoRef.current;
            const guide = guideRef.current;
            const container = videoContainerRef.current;

            const canvas = document.createElement('canvas');
            
            const containerRect = container.getBoundingClientRect();
            const guideRect = guide.getBoundingClientRect();

            const videoRatio = video.videoWidth / video.videoHeight;
            const containerRatio = containerRect.width / containerRect.height;

            let renderWidth, renderHeight, offsetX, offsetY;

            if (containerRatio > videoRatio) {
                renderWidth = containerRect.width;
                renderHeight = containerRect.width / videoRatio;
                offsetX = 0;
                offsetY = (containerRect.height - renderHeight) / 2;
            } else {
                renderHeight = containerRect.height;
                renderWidth = containerRect.height * videoRatio;
                offsetX = (containerRect.width - renderWidth) / 2;
                offsetY = 0;
            }

            const scale = video.videoWidth / renderWidth;

            const cropX = (guideRect.left - containerRect.left - offsetX) * scale;
            const cropY = (guideRect.top - containerRect.top - offsetY) * scale;
            const cropWidth = guideRect.width * scale;
            const cropHeight = guideRect.height * scale;

            canvas.width = cropWidth;
            canvas.height = cropHeight;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            
            ctx.drawImage(
                video,
                cropX, cropY, cropWidth, cropHeight,
                0, 0, cropWidth, cropHeight
            );
            
            imageSrc = canvas.toDataURL('image/jpeg', 0.8);
            setCapturedImage(imageSrc);
        } else {
            imageSrc = 'https://images.unsplash.com/photo-1544396821-4dd40b938ad3?ixlib=rb-4.0.3&auto=format&fit=crop&w=1280&q=80';
            setCapturedImage(imageSrc);
        }
        stopCamera();
        setScannerPhase('confirm_upload');
    };

    const closeScanner = () => {
        stopCamera();
        setScannerPhase('idle');
        setActiveWeek(null);
        setCapturedImage(null);
    };

    const uploadScannedLogbook = async () => {
        setIsProcessing(true);
        try {
            const existingLog = logbooks.find(l => l.objectData.week === activeWeek);
            if (existingLog) {
                const updatedLogData = {
                    ...existingLog.objectData,
                    rawImage: capturedImage,
                    digitizedImage: null,
                    logbookStatus: 'processing'
                };
                await dbUpdateObject('logbook', existingLog.objectId, updatedLogData);

                // Optimistically reflect the reset-to-"processing" status
                // locally and in the permanent cache right away, so the
                // completeness check doesn't keep treating this order as
                // finished while the re-upload is being digitized.
                const updatedLogs = logbooks.map(l =>
                    l.objectId === existingLog.objectId
                        ? { ...l, objectData: updatedLogData }
                        : l
                );
                setLogbooks(updatedLogs);
                writeLogbookCache(order.objectId, updatedLogs);
            } else {
                const newLog = await dbCreateObject('logbook', {
                    regNumber: user.regNumber,
                    orderId: order.objectId,
                    week: activeWeek,
                    rawImage: capturedImage,
                    digitizedImage: null,
                    logbookStatus: 'processing'
                });
                
                const updatedLogs = [...logbooks, newLog];
                setLogbooks(updatedLogs);
                writeLogbookCache(order.objectId, updatedLogs);
            }

            const newProgress = { ...progress };
            if (!newProgress['Uploading Logbook']) newProgress['Uploading Logbook'] = {};
            newProgress['Uploading Logbook'][activeWeek] = true; // Mark as uploaded locally (though full completion depends on digitized status)
            
            await dbUpdateObject('field_report_order', order.objectId, {
                ...order.objectData,
                progress: JSON.stringify(newProgress)
            });
            
            await dbCreateObject('notification', {
                regNumber: user.regNumber,
                title: 'Logbook Uploaded',
                message: `Your ${activeWeek} logbook has been uploaded and is waiting for verification.`,
                isRead: false,
                icon: 'cloud-upload'
            });
            
            closeScanner();
        } catch (e) {
            console.error("Upload failed", e);
        } finally {
            setIsProcessing(false);
        }
    };

    const progressInfo = getProgressInfo();

    return (
        <div className="flex flex-col w-full font-sans" data-name="order-progress" data-file="components/OrderProgress.js">
            <div className="sticky top-0 z-40 bg-[#f8f9fc] shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]">
                <div className="bg-[var(--primary-color)] pt-3 pb-4 px-4 relative rounded-b-2xl shadow-sm">
                    <div className="flex justify-between items-center mb-3 max-w-3xl mx-auto w-full">
                        <div className="flex items-center gap-1.5">
                            <button onClick={onBack} className="text-white hover:bg-white/20 p-1.5 rounded-full transition-colors flex items-center justify-center -ml-1.5">
                                <div className="icon-arrow-left text-xl"></div>
                            </button>
                            <div className="bg-white rounded w-6 h-6 flex items-center justify-center overflow-hidden p-0.5 shadow-sm">
                                <img src="https://app.trickle.so/storage/public/images/usr_1872e80110000001/881a2151-fcd3-465e-a969-91b300e1ab68.png" alt="HashREPORTS" className="w-full h-full object-contain" />
                            </div>
                            <span className="text-white font-bold text-sm tracking-tight drop-shadow-sm">HashREPORTS</span>
                        </div>
                    </div>

                    <div className="max-w-3xl mx-auto w-full">
                        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-3 shadow-inner flex flex-col gap-2">
                            <div className="flex justify-between items-start w-full">
                                <h4 className="font-bold text-white text-[11px] truncate flex-1 pr-2">
                                    {order.objectData?.reportType?.toUpperCase()} - {order.objectData?.organizationName?.toUpperCase()}
                                </h4>
                                <div className="flex items-center gap-2 shrink-0">
                                    {order.objectData?.status === 'PAID' ? (
                                        <>
                                            <span className="text-white/90 text-[10px] font-bold">Order No: {getOrderNumber ? getOrderNumber(order) : ''}</span>
                                            <span className="bg-green-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">PAID</span>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={onPayClick} className="bg-orange-400 text-white hover:bg-orange-500 transition-colors px-2 py-0.5 rounded text-[9px] font-bold flex items-center shadow-sm">
                                                <div className="icon-wallet mr-1"></div> Click here to pay
                                            </button>
                                            <span className="bg-red-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">UNPAID</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-1 text-blue-100 text-[9px]">
                                <div className="icon-calendar text-[10px]"></div>
                                <span>Order Date: {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '...'}</span>
                            </div>

                            <div className="flex flex-col gap-1 w-full mt-1">
                                <div className="flex justify-between items-end">
                                    <span className={`text-[10px] font-bold text-white`}>{progressInfo.status}</span>
                                    <span className="text-[10px] font-bold text-white">{progressInfo.pct}%</span>
                                </div>
                                <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden flex">
                                    <div className={`${progressInfo.color} h-full rounded-full transition-all duration-500`} style={{ width: `${progressInfo.pct}%` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-5 pt-4 pb-2 max-w-3xl mx-auto w-full flex justify-between items-center">
                    <div className="flex items-center gap-2 text-gray-800 font-bold text-sm">
                        <div className="icon-list-todo text-[var(--primary-color)]"></div> WRITING PROGRESS
                    </div>
                    
                    <div className="relative h-8 w-[190px] overflow-hidden rounded-lg">
                        <button 
                            onClick={handleDownload}
                            className={`absolute inset-0 w-full h-full flex items-center justify-center text-white font-bold text-[10px] shadow-sm transition-transform duration-500 ease-in-out bg-[var(--primary-color)] hover:bg-[var(--primary-dark)] ${downloadState !== 'idle' ? '-translate-y-full' : 'translate-y-0'}`}
                        >
                            <div className="icon-download mr-1 text-sm"></div> DOWNLOAD REPORT
                        </button>
                        <div 
                            className={`absolute inset-0 w-full h-full bg-red-500 flex items-center justify-center text-white font-bold text-[9px] shadow-sm transition-transform duration-500 ease-in-out ${downloadState === 'error' ? 'translate-y-0' : 'translate-y-full'}`}
                        >
                            <div className="icon-circle-alert mr-1 text-sm"></div> NOT COMPLETED
                        </div>
                        <div 
                            className={`absolute inset-0 w-full h-full bg-blue-500 flex items-center justify-center text-white font-bold text-[10px] shadow-sm transition-transform duration-500 ease-in-out ${downloadState === 'downloading' ? 'translate-y-0' : 'translate-y-full'}`}
                        >
                            <div className="icon-loader animate-spin mr-1.5 text-sm"></div> DOWNLOADING...
                        </div>
                        <div 
                            className={`absolute inset-0 w-full h-full bg-green-500 flex items-center justify-center text-white font-bold text-[10px] shadow-sm transition-transform duration-500 ease-in-out ${downloadState === 'success' ? 'translate-y-0' : 'translate-y-full'}`}
                        >
                            <div className="icon-circle-check mr-1.5 text-lg animate-bounce"></div> REPORT DOWNLOADED
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 w-full max-w-3xl mx-auto px-5 mt-3 pb-4">
                <div className="relative pb-6">
                    <div className="absolute left-[19px] top-6 bottom-10 w-[2px] bg-blue-100 z-0 rounded-full"></div>
                    <div className="flex flex-col gap-4 relative z-10">
                        {orderProgressStepsData.map((step, index) => {
                            const stepStatus = getStepStatus(step.title, step.subSteps);
                            const isExpanded = expandedStep === index;
                            const isPending = stepStatus === 'Pending';
                            const isLogbookStep = step.title === "Uploading Logbook";
                            
                            return (
                                <div key={index} id={`step-${index}`} className="flex gap-4 relative items-start">
                                    <div className="flex flex-col items-center mt-3 shrink-0">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm z-10 border-[3px] border-[#f8f9fc] transition-colors duration-300 ${statusConfig[stepStatus].iconBg}`}>
                                            <div className={`icon-${getStepIcon(step.title)} text-[16px]`}></div>
                                        </div>
                                    </div>

                                    <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300 self-start mt-0">
                                        <div 
                                            className="flex items-center p-3.5 cursor-pointer hover:bg-blue-50/30 transition-colors"
                                            onClick={() => {
                                                const isNowExpanded = !isExpanded;
                                                setExpandedStep(isNowExpanded ? index : null);
                                                if (isNowExpanded) {
                                                    // Wait for the collapse transition of any previously opened item (500ms) 
                                                    // to finish so the element's top position is stable.
                                                    setTimeout(() => {
                                                        const el = document.getElementById(`step-${index}`);
                                                        if (el) {
                                                            const header = document.querySelector('.sticky.top-0');
                                                            const headerHeight = header ? header.getBoundingClientRect().height : 160;
                                                            // Calculate exact Y position: Element's absolute top minus header height, with a 16px gap
                                                            const y = el.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
                                                            window.scrollTo({ top: y, behavior: 'smooth' });
                                                        }
                                                    }, 550);
                                                }
                                            }}
                                        >
                                            <div className="flex-1 min-w-0 pr-2">
                                                <h4 className={`text-[12px] font-bold truncate transition-colors duration-300 ${!isPending ? 'text-[var(--primary-color)]' : 'text-gray-700'}`}>
                                                    {step.title}
                                                </h4>
                                                <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{step.subSteps.length} tasks</p>
                                            </div>
                                            <div className="flex items-center gap-2.5 shrink-0">
                                                <span className={`text-[9px] font-bold px-2.5 py-1 rounded-md transition-colors duration-300 ${statusConfig[stepStatus].bg} ${statusConfig[stepStatus].text}`}>
                                                    {stepStatus}
                                                </span>
                                                <div className={`text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                                    <div className="icon-chevron-down text-sm"></div>
                                                </div>
                                            </div>
                                        </div>

                                        <div 
                                            className={`transition-all duration-500 ease-in-out overflow-hidden ${isExpanded ? 'opacity-100' : 'opacity-0'}`}
                                            style={{ maxHeight: isExpanded ? `${step.subSteps.length * 120 + 100}px` : '0px' }}
                                        >
                                            <div className="px-3.5 pb-3.5">
                                                <div className="grid gap-2 pt-3 border-t border-gray-100">
                                                    {step.subSteps.map((sub, sIndex) => {
                                                        const isLogbook = isLogbookStep;
                                                        const isSupervisor = step.title === "My Supervisors";
                                                        const isCompleteReportStep = step.title === "Uploading Your Complete Report";
                                                        const log = isLogbook ? logbooks.find(l => l.objectData.week === sub) : null;
                                                        
                                                        const isDigitized = isLogbook && log && String(log.objectData.logbookStatus).toLowerCase() === 'digitized';
                                                        const isProcessingLocally = isLogbook ? (log && !isDigitized) : isCompleteReportStep ? (order.objectData?.settled && !order.objectData?.reportPdfUrl) : false;
                                                        
                                                        const supData = isSupervisor ? (sub === 'Internal FIELD Supervisor' ? localSupervisors.internal : localSupervisors.external) : null;
                                                        const subCompleted = isLogbook ? isDigitized : isSupervisor ? !!supData : isCompleteReportStep ? !!order.objectData?.reportPdfUrl : (progress[step.title] && progress[step.title][sub]);
                                                        
                                                        return (
                                                            <div 
                                                                key={sIndex} 
                                                                className="flex flex-col bg-gray-50/80 p-2.5 rounded-lg border border-gray-100/80 transition-all duration-200 group"
                                                            >
                                                                <div className="flex justify-between items-center w-full">
                                                                    <div className="flex items-center gap-2.5 flex-1 pr-2">
                                                                        <div className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-300 ${subCompleted ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : isProcessingLocally ? 'bg-yellow-400' : 'bg-gray-300'}`}></div>
                                                                        
                                                                        <span className={`text-[11px] transition-colors duration-300 ${subCompleted ? 'text-gray-800 font-semibold' : 'text-gray-500 font-medium'}`}>
                                                                            {sub === 'Internal FIELD Supervisor' ? 'Internal Supervisor' : sub === 'External UDOM Supervisor' ? 'External Supervisor' : sub}
                                                                        </span>
                                                                        
                                                                        {isCompleteReportStep && isProcessingLocally && (
                                                                            <span className="bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded text-[9px] font-bold shadow-sm whitespace-nowrap">WRITING IN PROGRESS</span>
                                                                        )}

                                                                        {isSupervisor && (!order.objectData?.settled || !supData) && (
                                                                            <button 
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setSupervisorModal({
                                                                                        isOpen: true,
                                                                                        type: sub,
                                                                                        name: supData ? supData.name : '',
                                                                                        position: supData ? supData.position : ''
                                                                                    });
                                                                                }}
                                                                                className={supData 
                                                                                    ? "w-14 text-center shrink-0 bg-blue-50 text-blue-600 hover:bg-blue-100 py-0.5 rounded text-[8px] font-bold transition-colors shadow-sm border border-blue-100"
                                                                                    : "w-14 text-center shrink-0 bg-[var(--primary-color)] text-white hover:bg-[var(--primary-dark)] py-0.5 rounded text-[8px] font-bold transition-colors shadow-sm border border-[var(--primary-color)]"
                                                                                }
                                                                            >
                                                                                {supData ? 'CHANGE' : 'ADD'}
                                                                            </button>
                                                                        )}
                                                                        
                                                                        {isLogbookStep && (
                                                                            <div className={`flex gap-1.5 items-center shrink-0 transition-opacity duration-300 ${isInitialFetching ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                                                                                {!log ? (
                                                                                    <button disabled={isInitialFetching} onClick={(e) => { e.stopPropagation(); startUpload(sub); }} className="bg-[var(--primary-color)] text-white hover:bg-[var(--primary-dark)] px-2 py-0.5 rounded text-[9px] font-bold transition-colors shadow-sm">UPLOAD</button>
                                                                                ) : isProcessingLocally ? (
                                                                                    <span className="bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded text-[9px] font-bold shadow-sm whitespace-nowrap">ADMIN IS VERIFYING</span>
                                                                                ) : isDigitized ? (
                                                                                    <>
                                                                                        <button disabled={isInitialFetching} onClick={(e) => { e.stopPropagation(); setActiveWeek(sub); setScannerPhase('viewing'); }} className="bg-blue-100 text-blue-600 hover:bg-blue-200 px-2 py-0.5 rounded text-[9px] font-bold transition-colors shadow-sm">PREVIEW</button>
                                                                                        {!order.objectData?.settled && <button disabled={isInitialFetching} onClick={(e) => { e.stopPropagation(); startUpload(sub); }} className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-2 py-0.5 rounded text-[9px] font-bold transition-colors shadow-sm border border-gray-300">CHANGE</button>}
                                                                                    </>
                                                                                ) : null}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                        <span className="text-[9px] text-gray-400 font-bold hidden md:inline-block">~2%</span>
                                                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded transition-colors duration-300 ${subCompleted ? 'bg-green-100 text-green-600' : isProcessingLocally ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                                                                            {subCompleted ? 'Completed' : isProcessingLocally ? 'In Progress' : 'Pending'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                
                                                                {isSupervisor && supData && (
                                                                    <div className="mt-2.5 ml-4 bg-white border border-green-100 rounded-lg p-3 shadow-sm flex flex-col w-full max-w-[280px] border-l-4 border-l-green-500">
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <div className="w-5 h-5 rounded bg-green-50 flex items-center justify-center text-green-600">
                                                                                <div className="icon-user text-xs"></div>
                                                                            </div>
                                                                            <span className="text-[11px] font-bold text-gray-900 leading-tight">{supData.name}</span>
                                                                        </div>
                                                                        <span className="text-[10px] text-gray-500 font-medium ml-7">{supData.position}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Supervisor Modal */}
            {supervisorModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4 animate-fade-in pb-32 sm:pb-4 overflow-y-auto">
                    <div className={`bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in-up border border-gray-100 transition-transform duration-300 ${isInputFocused ? '-translate-y-28 sm:translate-y-0' : 'translate-y-0'}`}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">{supervisorModal.type}</h3>
                            <button onClick={() => setSupervisorModal({...supervisorModal, isOpen: false})} className="text-gray-400 hover:text-gray-600">
                                <div className="icon-x text-xl"></div>
                            </button>
                        </div>
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor Name</label>
                                <input 
                                    type="text"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] focus:border-transparent uppercase transition-all"
                                    placeholder="ENTER FULL NAME"
                                    value={supervisorModal.name}
                                    onFocus={() => setIsInputFocused(true)}
                                    onBlur={() => setIsInputFocused(false)}
                                    onChange={(e) => {
                                        const val = e.target.value.toUpperCase().replace(/[^A-Z\s.\-()]/g, '');
                                        setSupervisorModal({...supervisorModal, name: val});
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor Position</label>
                                <input 
                                    type="text"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] focus:border-transparent uppercase transition-all"
                                    placeholder="POSITION / TITLE"
                                    value={supervisorModal.position}
                                    onFocus={() => setIsInputFocused(true)}
                                    onBlur={() => setIsInputFocused(false)}
                                    onChange={(e) => {
                                        const val = e.target.value.toUpperCase().replace(/[^A-Z\s.\-()]/g, '');
                                        setSupervisorModal({...supervisorModal, position: val});
                                    }}
                                />
                            </div>
                        </div>
                        <button 
                            onClick={handleSupervisorSave}
                            disabled={!isSupervisorValid() || isSavingSupervisor}
                            className="bg-[var(--primary-color)] text-white font-bold w-full py-2.5 rounded-lg hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                        >
                            {isSavingSupervisor ? <div className="icon-loader animate-spin"></div> : null}
                            {isSavingSupervisor ? 'SAVING...' : (localSupervisors[supervisorModal.type === 'Internal FIELD Supervisor' ? 'internal' : 'external'] ? 'UPDATE SUPERVISOR' : 'ADD SUPERVISOR')}
                        </button>
                    </div>
                </div>
            )}

            {/* Scanner Modals */}
            {scannerPhase !== 'idle' && (
                <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center ${scannerPhase === 'camera' ? 'bg-[var(--primary-color)]' : 'bg-black/90 backdrop-blur-sm p-4'}`}>
                    {scannerPhase === 'info' && (
                        <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center animate-fade-in-up">
                            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <div className="icon-camera text-2xl text-[var(--primary-color)]"></div>
                            </div>
                            <h3 className="font-bold text-lg text-gray-900 mb-2">Upload {activeWeek}</h3>
                            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
                                Take a clear picture of the full A4 page of your {activeWeek} Logbook. Ensure the edges are visible and text is readable.
                            </p>
                            <div className="flex gap-3">
                                <button onClick={closeScanner} className="btn-outline flex-1 py-2 text-sm">CANCEL</button>
                                <button onClick={startCamera} className="btn-primary flex-1 py-2 text-sm">TAKE PICTURE</button>
                            </div>
                        </div>
                    )}

                    {scannerPhase === 'camera' && (
                        <div className="w-full h-full flex flex-col relative bg-[var(--primary-color)] overflow-hidden animate-fade-in">
                            {/* Shutter Animation Overlay */}
                            <div className="absolute inset-0 z-50 pointer-events-none flex">
                                <div className={`w-1/2 h-full bg-[var(--primary-color)] transition-transform duration-[800ms] ease-in-out ${cameraReady ? '-translate-x-full' : 'translate-x-0'}`}></div>
                                <div className={`w-1/2 h-full bg-[var(--primary-color)] transition-transform duration-[800ms] ease-in-out ${cameraReady ? 'translate-x-full' : 'translate-x-0'}`}></div>
                                
                                <div className={`absolute inset-0 flex items-center justify-center transition-all duration-[600ms] ${cameraReady ? 'opacity-0 scale-125' : 'opacity-100 scale-100'}`}>
                                    <div className="relative flex items-center justify-center">
                                        <div className="absolute inset-0 rounded-full border-[3px] border-white/20 border-t-white animate-spin w-24 h-24 -m-2"></div>
                                        <div className="bg-white rounded-full w-20 h-20 flex items-center justify-center shadow-xl p-2 z-10">
                                            <img src="https://app.trickle.so/storage/public/images/usr_1872e80110000001/881a2151-fcd3-465e-a969-91b300e1ab68.png" alt="Loading" className="w-full h-full object-contain" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className={`absolute top-4 left-4 right-4 flex justify-between z-40 items-start transition-opacity duration-500 ${cameraReady ? 'opacity-100' : 'opacity-0'}`}>
                                <div className="flex items-center gap-2">
                                    <div className="bg-white rounded-md w-8 h-8 flex items-center justify-center overflow-hidden p-0.5 shadow-md">
                                        <img src="https://app.trickle.so/storage/public/images/usr_1872e80110000001/881a2151-fcd3-465e-a969-91b300e1ab68.png" alt="Logo" className="w-full h-full object-contain" />
                                    </div>
                                    <span className="text-white font-bold text-base drop-shadow-sm">HashREPORTS</span>
                                </div>
                                <button onClick={closeScanner} className="w-10 h-10 bg-black/30 text-white rounded-full flex items-center justify-center backdrop-blur-md">
                                    <div className="icon-x text-xl"></div>
                                </button>
                            </div>
                            
                            <div className="flex-1 relative bg-black" ref={videoContainerRef}>
                                {isFlashing && <div className="absolute inset-0 bg-white z-[60] opacity-80 transition-opacity duration-150"></div>}
                                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                                {/* Guide Overlay (A4 Aspect Ratio approx 1:1.414) */}
                                <div ref={guideRef} className="absolute top-20 bottom-36 left-6 right-6 border-2 border-white border-dashed pointer-events-none flex items-center justify-center shadow-[0_0_0_9999px_var(--primary-color)] z-30">
                                    <div className="w-8 h-8 border-t-4 border-l-4 border-white absolute top-0 left-0 -ml-1 -mt-1 rounded-tl"></div>
                                    <div className="w-8 h-8 border-t-4 border-r-4 border-white absolute top-0 right-0 -mr-1 -mt-1 rounded-tr"></div>
                                    <div className="w-8 h-8 border-b-4 border-l-4 border-white absolute bottom-0 left-0 -ml-1 -mb-1 rounded-bl"></div>
                                    <div className="w-8 h-8 border-b-4 border-r-4 border-white absolute bottom-0 right-0 -mr-1 -mb-1 rounded-br"></div>
                                </div>
                            </div>
                            
                            <div className={`absolute bottom-8 left-0 right-0 flex items-center justify-center shrink-0 z-40 transition-opacity duration-500 ${cameraReady ? 'opacity-100' : 'opacity-0'}`}>
                                <button onClick={takePicture} className="w-20 h-20 bg-white rounded-full shadow-2xl flex items-center justify-center hover:scale-95 transition-transform p-[2px] border-4 border-gray-200">
                                    <div className="w-full h-full rounded-full border border-gray-100 flex items-center justify-center overflow-hidden bg-white">
                                        <img src="https://app.trickle.so/storage/public/images/usr_1872e80110000001/881a2151-fcd3-465e-a969-91b300e1ab68.png" alt="Capture" className="w-9 h-9 object-contain" />
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {scannerPhase === 'confirm_upload' && (
                        <div className="bg-white rounded-2xl p-5 max-w-xs w-full text-center animate-fade-in-up flex flex-col relative">
                            <button onClick={closeScanner} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 bg-gray-100 p-1.5 rounded-full z-10">
                                <div className="icon-x text-lg"></div>
                            </button>
                            
                            <h3 className="font-bold text-[var(--primary-color)] mb-1 pr-6 text-left">Confirm {activeWeek} Logbook</h3>
                            <p className="text-gray-500 text-[10px] mb-4 text-left leading-tight">Take Picture Again if Your Logbook is not Clear</p>
                            
                            <div className="w-full aspect-[1/1.414] bg-gray-100 rounded-lg overflow-hidden border border-gray-200 mb-5 relative flex items-center justify-center max-h-[45vh]">
                                <img src={capturedImage} className="max-w-full max-h-full object-contain" alt="Captured Logbook" />
                            </div>
                            
                            <div className="flex flex-col gap-2 shrink-0">
                                <button onClick={uploadScannedLogbook} disabled={isProcessing} className="btn-primary w-full shadow-md py-2.5 text-xs flex justify-center items-center">
                                    {isProcessing ? <div className="icon-loader animate-spin mr-2"></div> : null}
                                    UPLOAD LOGBOOK
                                </button>
                                <button onClick={startCamera} disabled={isProcessing} className="btn-outline w-full py-2.5 text-xs text-gray-600 border-gray-300 hover:bg-gray-50">
                                    TAKE PICTURE AGAIN
                                </button>
                            </div>
                        </div>
                    )}

                    {scannerPhase === 'viewing' && (
                        <div className="bg-white rounded-xl flex flex-col overflow-hidden animate-fade-in-up shadow-2xl w-full max-w-2xl max-h-[85vh] h-fit">
                            <div className="bg-gray-100 p-4 border-b border-gray-200 flex justify-between items-center shrink-0">
                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                    <div className="icon-image text-[var(--primary-color)]"></div> {activeWeek} Logbook Preview
                                </h3>
                                <button onClick={closeScanner} className="text-gray-500 hover:text-gray-800 bg-white p-1.5 rounded-full shadow-sm">
                                    <div className="icon-x text-lg"></div>
                                </button>
                            </div>
                            
                            <div className="flex-1 p-2 md:p-6 bg-gray-200 flex justify-center items-center overflow-auto">
                                {(() => {
                                    const log = logbooks.find(l => l.objectData.week === activeWeek);
                                    const displayImage = log && log.objectData.logbookStatus === 'digitized' && log.objectData.digitizedImage
                                        ? log.objectData.digitizedImage
                                        : log ? log.objectData.rawImage : null;
                                        
                                    if (displayImage) {
                                        return <img src={displayImage} alt="Logbook Preview" className="max-w-full max-h-full object-contain shadow-md rounded" />;
                                    } else {
                                        return <p className="text-gray-500">No image available.</p>;
                                    }
                                })()}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {/* Reminder Popup & Sequence Blocker */}
            {isAnimatingSequence && (
                <div className="fixed inset-0 z-[150] bg-transparent pointer-events-auto touch-none">
                    {showReminder && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-orange-50 rounded-xl shadow-2xl p-5 w-[90%] max-w-sm border border-orange-200 overflow-hidden">
                            <div className="flex gap-3 items-start relative z-10">
                                <div className="icon-triangle-alert text-orange-500 text-4xl shrink-0 mt-0.5"></div>
                                <p className="text-sm font-bold text-orange-900 leading-relaxed">
                                    {user.fullName?.split(' ')[0] || 'Student'}, Please Upload Your Logbooks and Add your Supervisors for us to start writing your Field Report.
                                </p>
                            </div>
                            <div className="absolute bottom-0 left-0 h-1 bg-orange-500 animate-shrink-10s"></div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export { OrderProgress };
export default OrderProgress;

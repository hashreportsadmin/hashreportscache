import React from 'react';

const LogoHeader = ({ showSlogan = true }) => (
    <div className="text-center z-10 relative mb-2" data-name="logo-header" data-file="components/SharedUI.js">
        <div className="flex justify-center">
            <img src="https://app.trickle.so/storage/public/images/usr_22ca06cc30000001/922907fd-f615-4a33-aabb-ac586c8b6c4f.png" alt="HashREPORTS Logo" className="h-36 md:h-44 w-full max-w-sm object-contain drop-shadow-xl" />
        </div>
        {showSlogan && (
            <p className="text-[var(--primary-dark)] font-medium text-[13px] mt-1 tracking-wide">
                Your Field Report and Research Platform
            </p>
        )}
    </div>
);

const BackgroundShapes = ({ isDark = false }) => {
    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" data-name="background-shapes" data-file="components/SharedUI.js">
            {isDark ? (
                <>
                    {/* Mobile Layout */}
                    <svg className="absolute w-full h-full md:hidden" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 400 800">
                        <rect width="400" height="800" fill="#0f172a" />
                        {/* Upper left solid circle */}
                        <circle cx="0" cy="50" r="120" fill="#2563eb" opacity="1" />
                        {/* Lower opacity circle behind it */}
                        <circle cx="50" cy="150" r="100" fill="#1d4ed8" opacity="0.3" />
                        
                        {/* Bottom solid wavy shape */}
                        <path d="M0,700 C150,600 250,800 400,650 L400,800 L0,800 Z" fill="#1e40af" opacity="1" />
                        {/* Lower opacity wavy shape overlapping bottom */}
                        <path d="M-50,650 C100,550 300,700 450,550 L450,850 L-50,850 Z" fill="#3b82f6" opacity="0.2" />
                    </svg>

                    {/* PC Layout */}
                    <svg className="absolute w-full h-full hidden md:block" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 1440 800">
                        <rect width="1440" height="800" fill="#0f172a" />
                        <polygon points="300,200 600,150 500,450 250,550" fill="#2563eb" opacity="1" />
                        <path d="M150,450 C350,250 650,550 950,350 L1150,650 L350,750 Z" fill="#0f2557" opacity="1" />
                        <circle cx="1100" cy="250" r="250" fill="#1e3a8a" opacity="0.3" />
                        <circle cx="200" cy="700" r="180" fill="#3b82f6" opacity="0.15" />
                        <path d="M-100,150 C200,300 500,-50 900,100 L1500,-50 L1500,-200 L-100,-200 Z" fill="#1d4ed8" opacity="0.25" />
                        <polygon points="1000,500 1300,450 1200,750 900,650" fill="#1e40af" opacity="0.4" />
                    </svg>
                </>
            ) : (
                <>
                    {/* Mobile Layout */}
                    <svg className="absolute w-full h-full md:hidden" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 400 800">
                        <rect width="400" height="800" fill="#f9fafb" />
                        {/* Upper left solid circle */}
                        <circle cx="0" cy="50" r="120" fill="var(--primary-color)" opacity="1" />
                        {/* Lower opacity shapes overlapping the top circle */}
                        <circle cx="60" cy="140" r="100" fill="#bae6fd" opacity="0.5" />
                        
                        {/* Bottom solid wavy shape */}
                        <path d="M0,700 C150,600 250,800 400,650 L400,800 L0,800 Z" fill="var(--primary-color)" opacity="1" />
                        {/* Lower opacity shapes overlapping the bottom wave */}
                        <path d="M-50,650 C100,550 300,700 450,550 L450,850 L-50,850 Z" fill="var(--primary-light)" opacity="0.8" />
                        <circle cx="350" cy="750" r="80" fill="var(--primary-color)" opacity="1" />
                    </svg>

                    {/* PC Layout */}
                    <svg className="absolute w-full h-full hidden md:block" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 1440 800">
                        <rect width="1440" height="800" fill="#f9fafb" />
                        {/* Solid blue blocks on the far edges for PC to frame the side-by-side content */}
                        <path d="M0,0 L250,0 C350,350 150,600 0,800 Z" fill="var(--primary-color)" opacity="1" />
                        <path d="M1440,800 L1150,800 C950,500 1100,150 1440,0 Z" fill="var(--primary-color)" opacity="0.9" />
                        
                        {/* Floating geometric elements for extra artistic touch */}
                        <circle cx="350" cy="120" r="80" fill="var(--primary-light)" opacity="0.9" />
                        <circle cx="1100" cy="680" r="140" fill="#bae6fd" opacity="0.5" />
                        <polygon points="200,600 320,520 280,680" fill="#3b82f6" opacity="0.15" />
                        <polygon points="1200,150 1350,80 1280,250" fill="#0284c7" opacity="0.1" />
                        <path d="M400,800 C600,650 800,900 1000,750 L1000,800 Z" fill="var(--primary-light)" opacity="0.6" />
                    </svg>
                </>
            )}
        </div>
    );
};

const Popup = ({ isOpen, title, message, icon, onConfirm, confirmText = "OKAY", onCancel, cancelText = "CANCEL", confirmButtonClass, cancelButtonClass }) => {
    React.useEffect(() => {
        if (isOpen && document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
    }, [isOpen]);

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-name="popup" data-file="components/SharedUI.js">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in-up border border-gray-100 text-center">
                {icon && <div className="text-5xl mb-4 flex justify-center">{icon}</div>}
                {title && <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>}
                <p className="text-gray-600 mb-6 leading-relaxed text-sm">{message}</p>
                <div className="flex gap-3 justify-center w-full">
                    {onCancel && (
                        <button onClick={onCancel} className={`${cancelButtonClass || 'btn-outline'} flex-1 shadow-sm py-2`}>
                            {cancelText}
                        </button>
                    )}
                    <button onClick={onConfirm} className={`${confirmButtonClass || 'btn-primary'} flex-1 shadow-md py-2`}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Custom Dropdown Component
const CustomSelect = ({ options, value, onChange, placeholder, isDark = false, error, optionIcons = {}, onOpenChange }) => {
    const [isOpen, setIsOpen] = React.useState(false);

    React.useEffect(() => {
        if (onOpenChange) {
            onOpenChange(isOpen);
        }
    }, [isOpen]);
    const [touched, setTouched] = React.useState(!!value && value !== placeholder);
    const selectRef = React.useRef(null);

    React.useEffect(() => {
        const handleClickOutside = (e) => {
            if (selectRef.current && !selectRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isValid = touched && value && value !== placeholder && !error;
    const hasError = touched && !!error;

    return (
        <div className="relative" ref={selectRef}>
            <div 
                className={`w-full flex items-center justify-between cursor-pointer border rounded-lg px-4 py-3 transition-all ${
                    isDark 
                        ? 'bg-gray-950/50 text-white border-gray-700 hover:border-gray-500' 
                        : 'bg-white/50 text-gray-800 border-gray-300 hover:border-[var(--primary-color)]'
                } ${hasError ? '!border-red-500' : ''} ${isValid ? '!border-green-500 !border-[1.5px]' : ''}`}
                onClick={() => { setIsOpen(!isOpen); setTouched(true); }}
            >
                <div className="flex items-center gap-3 overflow-hidden">
                    {value && value !== placeholder && optionIcons[value] && (
                        <img src={optionIcons[value]} alt={value} className="w-6 h-6 object-contain rounded-full bg-white border border-gray-100 shrink-0" />
                    )}
                    <span className={`truncate ${!value || value === placeholder ? (isDark ? 'text-gray-400' : 'text-gray-500') : ''}`}>
                        {value || placeholder}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`icon-chevron-down transition-transform ${isOpen ? 'rotate-180' : ''}`}></div>
                    {isValid && <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white shrink-0"><div className="icon-check text-sm"></div></div>}
                </div>
            </div>
            
            {hasError && <p className="text-red-500 text-xs mt-1.5 ml-1 animate-fade-in">{error}</p>}

            {isOpen && (
                <div className={`absolute z-[100] w-full mt-1 rounded-lg shadow-2xl border overflow-hidden max-h-60 overflow-y-auto ${
                    isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-100'
                }`}>
                    {options.map((opt) => (
                        <div 
                            key={opt}
                            className={`px-4 py-3 cursor-pointer transition-colors flex items-center gap-3 ${
                                isDark 
                                    ? 'hover:bg-gray-800 text-gray-200' 
                                    : 'hover:bg-blue-50 text-gray-700'
                            } ${value === opt ? (isDark ? 'bg-gray-800 font-bold' : 'bg-blue-50 text-[var(--primary-color)] font-bold') : ''}`}
                            onClick={() => {
                                onChange(opt);
                                setIsOpen(false);
                            }}
                        >
                            {optionIcons && optionIcons[opt] && (
                                <img src={optionIcons[opt]} alt={opt} className="w-6 h-6 object-contain rounded-full bg-white border border-gray-100 shrink-0" />
                            )}
                            <span className="truncate">{opt}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Validated Input Component
const ValidatedInput = ({ 
    id,
    type = "text", 
    label, 
    value, 
    onChange, 
    onClick,
    placeholder, 
    validate, // function returning error string or null
    isDark = false,
    showEye = false,
    className = "",
    forceSuccess = null, // optional boolean to override internal validity
    disabled = false,
    autoComplete = "off"
}) => {
    const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
    const [touched, setTouched] = React.useState(!!value);

    React.useEffect(() => {
        if (value && !touched) {
            setTouched(true);
        }
    }, [value]);

    const error = touched ? validate(value) : null;
    const isInternalValid = touched && value && !error;
    const isValid = forceSuccess !== null ? forceSuccess : isInternalValid;

    const baseInputStyle = isDark 
        ? "w-full bg-gray-950/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:!ring-0 focus:!border-[1px] focus:!border-[var(--primary-color)] transition-all"
        : "input-field bg-white/50 focus:!ring-0 focus:!border-[1px] focus:!border-[var(--primary-color)]";

    const errorStyle = error ? "!border-red-500 focus:!border-red-500 text-gray-900 focus:!ring-red-500/10" : "text-gray-900";
    const successStyle = isValid ? "!border-green-500 !border-[1.5px] focus:!border-[1px] focus:!border-green-500" : "";
    const disabledStyle = disabled ? "opacity-50 cursor-not-allowed bg-gray-200/50" : "";

    const inputType = showEye && !isPasswordVisible ? "password" : type === "password" ? "text" : type;
    const paddingRight = showEye ? 'pr-16' : 'pr-10'; // Always reserve space so text doesn't jump

    return (
        <div className="relative">
            {label && <label className={`form-label ${isDark ? 'text-gray-300 ml-1' : ''}`}>{label}</label>}
            <div className="relative">
                <input 
                    id={id}
                    type={inputType}
                    value={value}
                    disabled={disabled}
                    autoComplete={autoComplete}
                    onChange={(e) => {
                        setTouched(true);
                        onChange(e);
                    }}
                    onFocus={() => setTouched(true)}
                    onBlur={() => setTouched(true)}
                    onClick={(e) => {
                        if (onClick) onClick(e);
                        setTouched(true);
                    }}
                    placeholder={placeholder}
                    className={`${baseInputStyle} ${errorStyle} ${successStyle} ${disabledStyle} ${paddingRight} ${className}`}
                />
                
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {showEye && (
                        <button type="button" className={`hover:text-[var(--primary-color)] transition-colors ${isDark ? 'text-gray-500' : 'text-gray-400'} flex items-center justify-center`}
                            onClick={() => setIsPasswordVisible(!isPasswordVisible)}>
                            <div className={`icon-${isPasswordVisible ? 'eye-off' : 'eye'} text-lg`}></div>
                        </button>
                    )}
                    {isValid && <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white shrink-0"><div className="icon-check text-sm"></div></div>}
                </div>
            </div>
            {error && <p className="text-red-500 text-xs mt-1.5 ml-1 animate-fade-in">{error}</p>}
        </div>
    );
};

export { LogoHeader, BackgroundShapes, Popup, CustomSelect, ValidatedInput };
export default ValidatedInput;

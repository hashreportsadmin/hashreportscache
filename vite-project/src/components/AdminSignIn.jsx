import React from 'react';
import { ContactFooter } from './ContactFooter';
import { BackgroundShapes, CustomSelect, LogoHeader, ValidatedInput } from './SharedUI';

const AdminSignIn = ({ onNavigate, onLoginSuccess }) => {
    const [authority, setAuthority] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [loginStatus, setLoginStatus] = React.useState('idle');

    const authorities = ["Chief Executive Officer", "Accountant", "Report Writer"];
    
    const validPasswords = {
        "Chief Executive Officer": "CEOHashREPORTS0801@2026",
        "Accountant": "ACCHashREPORTS@2026",
        "Report Writer": "HashREPORTS@2026"
    };

    const valAuth = (v) => (!v || v === "Select Authority" ? "Authority is required" : null);
    const valPass = (v) => {
        if (!v) return "Password is required";
        if (validPasswords[authority] !== v) {
            return "Password is incorrect";
        }
        return null;
    };

    const handleSignIn = () => {
        setIsLoading(true);
        setTimeout(() => {
            setIsLoading(false);
            localStorage.setItem('adminAuthority', authority);
            onLoginSuccess('admin');
        }, 1000);
    };

    const isValid = !valAuth(authority) && !valPass(password);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col p-6 relative overflow-hidden" data-name="admin-signin" data-file="components/AdminSignIn.js">
            <BackgroundShapes />
            
            <div className="w-full max-w-md md:max-w-4xl mx-auto relative z-10 flex flex-col md:flex-row md:items-center md:gap-12 pt-4 h-full md:h-auto md:min-h-[70vh] md:mt-12">
                
                {/* Left Side (PC) / Top (Mobile) */}
                <div className="md:w-1/2 flex flex-col justify-center">
                    <LogoHeader />
                    
                    <div className="hidden md:block mt-8 text-center px-4">
                        <div className="w-24 h-24 mx-auto bg-gray-100 border-2 border-gray-200 rounded-full flex items-center justify-center mb-6 shadow-inner">
                            <div className="icon-shield text-5xl text-gray-700"></div>
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Authorized Personnel</h3>
                        <p className="text-gray-600 leading-relaxed text-sm">
                            Secure admin portal for managing student requests, approving reports, and overseeing university data operations.
                        </p>
                    </div>
                </div>
                
                {/* Right Side (PC) / Bottom (Mobile) */}
                <div className="md:w-1/2">
                    <div className="glass-card p-5 md:p-8 mt-2 md:mt-0 shadow-2xl relative z-20">
                    <div className="flex items-center justify-start gap-2 mb-6">
                        <div className="icon-shield-check text-xl md:text-2xl text-[var(--primary-color)]"></div>
                        <h1 className="text-xl md:text-2xl font-bold text-[var(--primary-color)]">Admin Sign In</h1>
                    </div>
                    
                    <div className="space-y-3 md:space-y-5 mb-5">
                        <div>
                            <label className="form-label">Authority</label>
                            <CustomSelect 
                                options={authorities}
                                value={authority}
                                placeholder="Select Authority"
                                onChange={(val) => {
                                    setAuthority(val);
                                    setLoginStatus('idle');
                                }}
                                error={valAuth(authority)}
                            />
                        </div>
                        
                        <ValidatedInput 
                            label="Password" 
                            placeholder="Enter admin password"
                            type="password"
                            showEye={true}
                            disabled={!!valAuth(authority)}
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setLoginStatus('idle');
                                if (!valAuth(authority) && validPasswords[authority] === e.target.value) {
                                    setTimeout(() => document.activeElement?.blur(), 100);
                                }
                            }}
                            validate={valPass}
                        />
                    </div>

                    <button onClick={handleSignIn} disabled={!isValid || isLoading}
                        className="btn-primary w-full shadow-lg shadow-[var(--primary-light)]">
                        {isLoading ? <div className="icon-loader animate-spin mr-2"></div> : null}
                        SIGN IN
                    </button>
                    
                    <div className="mt-4 text-center flex flex-col gap-2">
                        <p className="text-gray-600 font-medium text-sm">
                            Are you a Student? <button onClick={() => onNavigate('signin')} className="font-bold text-[var(--primary-color)] hover:text-[var(--primary-dark)] transition-colors ml-1">Sign In</button>
                        </p>
                    </div>
                </div>
                </div>
            </div>

            <ContactFooter />
        </div>
    );
};

export { AdminSignIn };
export default AdminSignIn;

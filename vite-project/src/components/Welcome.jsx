import React from 'react';
import { BackgroundShapes, LogoHeader } from './SharedUI';

const Welcome = ({ onGetStarted, onSignIn }) => {
    const [currentSlide, setCurrentSlide] = React.useState(0);
    const slides = [
        {
            title: "Request Field Report",
            desc: "Easily request, pay, and track your field reports with a few taps.",
            price: "TZS 15,000",
            img: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
        },
        {
            title: "Request Research Report",
            desc: "Easily request, pay and track your research reports with a few taps.",
            price: "TZS 25,000",
            img: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
        }
    ];

    React.useEffect(() => {
        const timer = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % slides.length);
        }, 4000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col p-6 relative overflow-hidden" data-name="welcome" data-file="components/Welcome.js">
            <BackgroundShapes />
            
            <div className="w-full max-w-md md:max-w-5xl mx-auto relative z-10 flex flex-col md:flex-row md:items-center md:gap-12 pt-2 pb-4 h-full md:h-auto md:min-h-[80vh] md:mt-10">
                
                {/* Mobile Logo */}
                <div className="block md:hidden mb-4 w-full">
                    <LogoHeader showSlogan={true} />
                </div>

                {/* Left Side (PC) / Bottom (Mobile) */}
                <div className="md:w-1/2 flex flex-col order-2 md:order-1">
                    <div className="hidden md:block">
                        <LogoHeader showSlogan={true} />
                    </div>
                    
                    <div className="text-center md:text-left px-4 mb-6 md:mb-0 md:mt-8 md:px-8">
                        <h3 className="text-[var(--primary-dark)] font-bold text-base md:text-2xl mb-2 md:mb-4">Welcome to the Future of Academics</h3>
                        <p className="text-gray-600 md:text-gray-700 leading-relaxed text-[11px] md:text-sm">
                            Experience the fastest way to request and track your university field reports & researches by Academic Professionals from your own University at Very Cheap Prices.
                        </p>
                        
                        <div className="mt-2 text-center md:text-left">
                            <p className="text-[11px] font-bold text-gray-800">
                                HASHIMU SHABANI HALIFA <span className="text-gray-400 mx-1">|</span> <span className="text-[var(--primary-color)]">Founder & CEO</span>
                            </p>
                        </div>
                        
                        <div className="mt-5 text-center md:text-left">
                            <button onClick={onGetStarted} className="btn-primary w-full md:w-auto md:px-12 text-base shadow-lg shadow-[var(--primary-light)] mb-4 active:scale-95 transition-transform">
                                GET STARTED
                            </button>
                            <p className="text-gray-600">
                                Already have an Account? <button onClick={onSignIn} className="text-[var(--primary-color)] font-semibold hover:text-[var(--primary-dark)] transition-colors ml-1">Sign In</button>
                            </p>
                        </div>
                    </div>
                </div>
                
                {/* Right Side (PC) / Top (Mobile) */}
                <div className="md:w-1/2 flex flex-col h-full md:h-auto order-1 md:order-2">
                    <div className="glass-card p-4 md:p-6 mb-5 mt-2 md:mt-0 shadow-2xl">
                        <div className="relative h-48 md:h-72 rounded-xl overflow-hidden shadow-inner">
                            {slides.map((slide, i) => (
                                <div key={i} className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${i === currentSlide ? 'opacity-100' : 'opacity-0'}`}>
                                    <img src={slide.img} alt="Slide" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-5 pointer-events-none">
                                        <div className="flex flex-col mb-1">
                                            {slide.price && (
                                                <span className="bg-white/20 backdrop-blur-sm border border-white/40 text-white px-2 py-0.5 rounded text-[10px] md:text-xs tracking-wider uppercase shadow-sm w-max mb-1 md:mb-2">
                                                    {slide.price}
                                                </span>
                                            )}
                                            <h2 className="text-white text-lg md:text-xl font-bold">{slide.title}</h2>
                                        </div>
                                        <p className="text-white/90 text-[9px] md:text-[11px] lg:text-xs whitespace-nowrap">{slide.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <div className="flex justify-center gap-2 mt-4 md:mt-6">
                            {slides.map((_, i) => (
                                <div key={i} className={`h-1.5 md:h-2 rounded-full ${i === currentSlide ? 'bg-[var(--primary-color)] w-6 md:w-8' : 'bg-gray-200 w-2 md:w-3'} transition-all duration-300`}></div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export { Welcome };
export default Welcome;

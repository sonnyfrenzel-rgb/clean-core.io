'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Code2, LayoutTemplate, Cpu, ShieldCheck, FileText, Download, Play, Pause } from 'lucide-react';
import { clsx } from 'clsx';
import Image from 'next/image';

const slides = [
  {
    id: 'analyze',
    title: 'Deep Code Intelligence',
    description: 'Legacy ABAP is analyzed in seconds. We extract business rules and dependencies fully automatically – without weeks of workshops.',
    icon: <Code2 className="w-6 h-6" />,
    image: '/screenshots/step-1.jpg',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200'
  },
  {
    id: 'design',
    title: 'Cloud-Native Architecture',
    description: 'From monolith to microservices. Generate a modern, scalable solution design at the push of a button.',
    icon: <LayoutTemplate className="w-6 h-6" />,
    image: '/screenshots/step-2.jpg',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200'
  },
  {
    id: 'transform',
    title: 'Automated Refactoring',
    description: 'Flawless translation from ABAP to Node.js & TypeScript. Clean, maintainable code that follows best practices.',
    icon: <Cpu className="w-6 h-6" />,
    image: '/screenshots/step-3.jpg',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200'
  },
  {
    id: 'test',
    title: 'Isolated Sandbox Validation',
    description: 'Zero-risk deployment. Auto-generated test cases validate business logic in a secure, isolated environment.',
    icon: <ShieldCheck className="w-6 h-6" />,
    image: '/screenshots/step-4.jpg',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200'
  },
  {
    id: 'document',
    title: 'Enterprise Process Specs',
    description: 'Aligning IT and Business. Automatic generation of BPMN models and detailed process documentation.',
    icon: <FileText className="w-6 h-6" />,
    image: '/screenshots/step-5.jpg',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200'
  },
  {
    id: 'deliver',
    title: 'Ready for Deployment',
    description: 'The complete package: Source code, executive summary, and QA reports. Ready for production deployment in your cloud.',
    icon: <Download className="w-6 h-6" />,
    image: '/screenshots/step-6.jpg',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200'
  }
];

export default function LandingSlideshow() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isHovered || !isPlaying) return;
    
    const intervalTime = 50; // Update every 50ms for hyper-smooth movement
    const step = (intervalTime / 5000) * 100; // Increment percentage (50ms / 5000ms * 100 = 1%)
    
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setCurrentIndex((current) => (current + 1) % slides.length);
          return 0;
        }
        return prev + step;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isHovered, isPlaying]);

  return (
    <div className="w-full max-w-6xl mx-auto mt-16 mb-24 px-4 sm:px-6">
      <div 
        className="bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden flex flex-col lg:flex-row"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Left Side: Content & Navigation */}
        <div className="w-full lg:w-1/3 bg-gray-50 p-6 sm:p-8 md:p-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-gray-100">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 text-green-800 font-bold text-xs uppercase tracking-wider mb-6 sm:mb-8">
              The Clean-Core Process
            </div>
            
            <div className="relative h-56 sm:h-48 lg:h-56">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0"
                >
                  <div className={clsx("w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-4 sm:mb-6", slides[currentIndex].bgColor, slides[currentIndex].color)}>
                    {slides[currentIndex].icon}
                  </div>
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-gray-900 mb-3 sm:mb-4 tracking-tight leading-tight">
                    {slides[currentIndex].title}
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 font-medium leading-relaxed">
                    {slides[currentIndex].description}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Progress Indicators */}
          <div className="mt-12 flex items-center gap-3">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
              aria-label={isPlaying ? "Pause slideshow" : "Play slideshow"}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <div className="flex-1 flex gap-2">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentIndex(idx);
                    setProgress(0);
                    setIsPlaying(false); // Pause when manually selecting a slide
                  }}
                  className="relative h-2 flex-1 rounded-full overflow-hidden bg-gray-200 transition-all"
                  aria-label={`Go to slide ${idx + 1}`}
                >
                  {idx === currentIndex && (
                    <div 
                      className="absolute top-0 left-0 h-full bg-green-600"
                      style={{ 
                        width: `${progress}%`,
                        transition: isPlaying && !isHovered ? 'width 50ms linear' : 'none'
                      }}
                    />
                  )}
                  {idx < currentIndex && (
                    <div className="absolute top-0 left-0 h-full w-full bg-green-600" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Image Display */}
        <div className="w-full lg:w-2/3 bg-gray-100 relative p-4 sm:p-6 md:p-10 flex items-center justify-center h-[320px] sm:h-[450px] lg:h-auto lg:min-h-[600px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="absolute inset-0 p-4 sm:p-6 md:p-10 flex items-center justify-center"
            >
              <div className="w-full h-full relative rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-gray-200/50 bg-white flex items-center justify-center">
                {/* Fallback UI if images are not uploaded yet */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50 z-0 text-center p-4">
                  {slides[currentIndex].icon}
                  <p className="mt-4 text-sm font-medium">Screenshot {currentIndex + 1} will appear here</p>
                  <p className="text-xs opacity-50">(Upload to /public/screenshots/step-{currentIndex + 1}.jpg)</p>
                </div>
                
                {/* Actual Image */}
                <Image 
                  src={slides[currentIndex].image} 
                  alt={slides[currentIndex].title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  className="object-cover object-left-top md:object-top relative z-10 transition-opacity duration-300"
                  onError={(e) => {
                    // Hide image if it fails to load, revealing the fallback UI behind it
                    (e.target as HTMLImageElement).style.opacity = '0';
                  }}
                  onLoad={(e) => {
                    (e.target as HTMLImageElement).style.opacity = '1';
                  }}
                  priority={currentIndex === 0}
                />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        {/* Hidden Preloading Pipeline to cache all slides instantly */}
        <div className="hidden" aria-hidden="true" style={{ display: 'none' }}>
          {slides.map((slide, idx) => (
            idx > 0 && (
              <Image 
                key={idx}
                src={slide.image} 
                alt=""
                width={1280}
                height={800}
                priority
              />
            )
          ))}
        </div>
      </div>
    </div>
  );
}

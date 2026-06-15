'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Code2, LayoutTemplate, Cpu, ShieldCheck, FileText, Download, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import Image from 'next/image';

const slides = [
  {
    id: 'analyze',
    title: 'Deep Code Intelligence',
    description: 'Legacy ABAP is analyzed in seconds. Business rules, dependencies, and Clean Core compliance scores are extracted fully automatically.',
    icon: <Code2 className="w-6 h-6" />,
    image: '/screenshots/step-1.jpg',
    alt: 'Clean-Core.io Deep Code Intelligence dashboard analyzing legacy SAP ABAP custom code, showing dependency graphs, business rules, and Clean Core compliance score.',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200'
  },
  {
    id: 'design',
    title: 'Cloud-Native Architecture',
    description: 'From monolith to SAP RAP. Auto-generated architecture blueprints with CDS views, behavior definitions, and API catalogs.',
    icon: <LayoutTemplate className="w-6 h-6" />,
    image: '/screenshots/step-2.jpg',
    alt: 'Clean-Core.io Cloud-Native Architecture blueprint generator showcasing automated mapping from legacy ABAP monoliths to SAP RAP, including CDS views and API catalogs.',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200'
  },
  {
    id: 'transform',
    title: 'Automated Refactoring',
    description: 'Flawless transformation from legacy ABAP to Node.js & TypeScript. Clean, maintainable code that follows SAP Clean Core best practices.',
    icon: <Cpu className="w-6 h-6" />,
    image: '/screenshots/step-3.jpg',
    alt: 'Clean-Core.io Automated Refactoring interface converting legacy ABAP source code into clean TypeScript and Node.js code side-by-side.',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200'
  },
  {
    id: 'test',
    title: 'Live Tenant Validation',
    description: 'Connect your S/4HANA tenant and validate in real-time: connectivity, authentication, OData schema discovery, and live data reads.',
    icon: <ShieldCheck className="w-6 h-6" />,
    image: '/screenshots/step-4.jpg',
    alt: 'Clean-Core.io Live Tenant Validation tool running automated integration tests and OData schema checks against active SAP S/4HANA instances.',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200'
  },
  {
    id: 'document',
    title: 'Enterprise Process Specs',
    description: 'Aligning IT and Business. Automatic generation of BPMN models, Jira integration, and detailed process documentation.',
    icon: <FileText className="w-6 h-6" />,
    image: '/screenshots/step-5.jpg',
    alt: 'Clean-Core.io Enterprise Process Specifications report highlighting automatically generated BPMN 2.0 process flow diagrams and JIRA integration specs.',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200'
  },
  {
    id: 'deliver',
    title: 'Ready for Deployment',
    description: 'The complete package: Source code, tenant validation report, executive summary, and QA reports — ready for production.',
    icon: <Download className="w-6 h-6" />,
    image: '/screenshots/step-6.jpg',
    alt: 'Clean-Core.io Delivery package download screen displaying source code packages, executive TCO roadmap, and final QA verification reports.',
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

  const goToPrev = () => {
    setCurrentIndex((current) => (current - 1 + slides.length) % slides.length);
    setProgress(0);
  };

  const goToNext = () => {
    setCurrentIndex((current) => (current + 1) % slides.length);
    setProgress(0);
  };

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
        <div className="w-full lg:w-2/3 bg-gray-100 relative p-2 sm:p-3 md:p-4 flex items-center justify-center h-[320px] sm:h-[450px] lg:h-auto lg:min-h-[600px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="absolute inset-0 p-2 sm:p-3 md:p-4 flex items-center justify-center"
            >
              <div className="w-full aspect-[16/10] relative rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-gray-200/50 bg-white flex items-center justify-center">
                {/* Clean Loading Placeholder (No visible Dev text or layout issues for SEO crawlers) */}
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-0">
                  <div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-green-600 animate-spin" />
                </div>
                
                {/* Actual Image */}
                <Image 
                  src={slides[currentIndex].image} 
                  alt={slides[currentIndex].alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  className="object-cover relative z-10 transition-opacity duration-300"
                  onError={(e) => {
                    // Hide image if it fails to load
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

          {/* Navigation Arrows */}
          <button
            onClick={goToPrev}
            className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white/70 backdrop-blur-sm border border-gray-200/60 shadow-lg text-gray-600 hover:bg-white hover:text-gray-900 hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <button
            onClick={goToNext}
            className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white/70 backdrop-blur-sm border border-gray-200/60 shadow-lg text-gray-600 hover:bg-white hover:text-gray-900 hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer"
            aria-label="Next slide"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
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

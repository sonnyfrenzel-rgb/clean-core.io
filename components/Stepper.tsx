import { Check } from 'lucide-react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';

export default function Stepper({ currentStep, projectId, cleanCoreScore, transformationBypass }: { currentStep: number, projectId?: string, cleanCoreScore?: number, transformationBypass?: boolean }) {
  const router = useRouter();
  const steps = [
    { name: 'Upload', path: 'dashboard' },
    { name: 'Analyze', path: 'analyze' },
    { name: 'Design', path: 'design' },
    { name: 'Transformation', path: 'transformation' },
    { name: 'Testing', path: 'testing' },
    { name: 'Documentation', path: 'documentation' },
    { name: 'Delivery', path: 'delivery' }
  ];

  const handleNavigate = (path: string, stepNum: number) => {
    if (!projectId && path !== 'dashboard') return;
    
    // Allow navigation to previous steps, current step, or if step 7 is unlocked via transformationBypass
    if (stepNum <= currentStep || (projectId && stepNum <= currentStep + 1) || (stepNum === 7 && transformationBypass)) {
      if (path === 'dashboard') {
        router.push('/dashboard');
      } else {
        router.push(`/project/${projectId}/${path}`);
      }
      window.scrollTo(0, 0);
    }
  };

  return (
    <div className="mb-16 relative mx-2 sm:mx-0">
      <div className="flex items-center justify-between relative z-10">
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isActive = stepNum === currentStep;
          const isCompleted = stepNum < currentStep;
          let isAccessible = stepNum <= currentStep || (projectId && isCompleted);

          // Force Step 7 (Delivery) to be accessible if transformation progress is >90% (transformationBypass is true)
          if (stepNum === 7 && transformationBypass) {
            isAccessible = true;
          }

          return (
            <div 
              key={step.name} 
              className={clsx(
                "flex flex-col items-center relative bg-gray-50 px-1 sm:px-2 transition-all duration-300",
                isAccessible ? "cursor-pointer hover:scale-105" : "cursor-not-allowed opacity-60"
              )}
              onClick={() => isAccessible && handleNavigate(step.path, stepNum)}
            >
              <div className={clsx(
                "w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 text-xs sm:text-sm font-semibold transition-all duration-300 shadow-sm",
                isActive ? "border-green-600 bg-green-600 text-white scale-110" :
                isCompleted ? "border-green-600 bg-white text-green-600" :
                "border-gray-300 bg-white text-gray-400"
              )}>
                {isCompleted ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : stepNum}
              </div>
              <span className={clsx(
                "absolute -bottom-7 text-[9px] sm:text-xs font-medium uppercase tracking-wider whitespace-nowrap",
                isActive ? "text-green-600 block" : isCompleted ? "text-gray-600 hidden sm:block" : "text-gray-400 hidden sm:block"
              )}>{step.name}</span>
            </div>
          );
        })}
      </div>
      {/* Progress Bar Background */}
      <div className="absolute top-4 sm:top-5 left-0 w-full h-[2px] bg-gray-200 z-0">
        <div 
          className="absolute top-0 left-0 h-full bg-green-600 transition-all duration-500 ease-in-out" 
          style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }} 
        />
      </div>
    </div>
  );
}

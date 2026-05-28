import { Check } from 'lucide-react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';

export default function Stepper({ currentStep, projectId }: { currentStep: number, projectId?: string }) {
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
    
    // Allow navigation to previous steps or current step
    if (stepNum <= currentStep || (projectId && stepNum <= currentStep + 1)) {
      if (path === 'dashboard') {
        router.push('/dashboard');
      } else {
        router.push(`/project/${projectId}/${path}`);
      }
      window.scrollTo(0, 0);
    }
  };

  return (
    <div className="mb-16 relative">
      <div className="flex items-center justify-between relative z-10">
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isActive = stepNum === currentStep;
          const isCompleted = stepNum < currentStep;
          const isAccessible = stepNum <= currentStep || (projectId && isCompleted);

          return (
            <div 
              key={step.name} 
              className={clsx(
                "flex flex-col items-center relative bg-gray-50 px-2 transition-all duration-300",
                isAccessible ? "cursor-pointer hover:scale-105" : "cursor-not-allowed opacity-60"
              )}
              onClick={() => isAccessible && handleNavigate(step.path, stepNum)}
            >
              <div className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 font-semibold transition-all duration-300 shadow-sm",
                isActive ? "border-green-600 bg-green-600 text-white scale-110" :
                isCompleted ? "border-green-600 bg-white text-green-600" :
                "border-gray-300 bg-white text-gray-400"
              )}>
                {isCompleted ? <Check className="w-5 h-5" /> : stepNum}
              </div>
              <span className={clsx(
                "absolute -bottom-7 text-[10px] sm:text-xs font-medium uppercase tracking-wider whitespace-nowrap",
                isActive ? "text-green-600 block" : isCompleted ? "text-gray-600 hidden sm:block" : "text-gray-400 hidden sm:block"
              )}>{step.name}</span>
            </div>
          );
        })}
      </div>
      {/* Progress Bar Background */}
      <div className="absolute top-5 left-0 w-full h-[2px] bg-gray-200 z-0">
        <div 
          className="absolute top-0 left-0 h-full bg-green-600 transition-all duration-500 ease-in-out" 
          style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }} 
        />
      </div>
    </div>
  );
}

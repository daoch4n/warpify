let currentIndex = 0;

export const createLoadBalancer = (workers, strategy) => {
  if (!Array.isArray(workers) || workers.length === 0) {
    throw new Error('Worker list must be a non-empty array.');
  }

  const getNextWorker = () => {
    if (strategy === 'round-robin') {
      const worker = workers[currentIndex];
      currentIndex = (currentIndex + 1) % workers.length;
      return worker;
    }
    // Default to random strategy
    const randomIndex = Math.floor(Math.random() * workers.length);
    return workers[randomIndex];
  };

  return { getNextWorker };
};

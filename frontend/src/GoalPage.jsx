import { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance.js';
import { AuthContext } from './AuthContext.jsx';

export default function GoalPage() {
  const { isAuthenticated } = useContext(AuthContext);
  const [goals, setGoals] = useState([]);
  const [newGoal, setNewGoal] = useState({ title: '', description: '', steps: [] });

  useEffect(() => {
    if (!isAuthenticated) {
      setGoals([]);
      return;
    }

    let isMounted = true;
    axios.get('/api/goals')
      .then((res) => { if (isMounted) setGoals(Array.isArray(res.data) ? res.data : []); })
      .catch((err) => { console.error('Failed to load goals', err); if (isMounted) setGoals([]); });

    return () => { isMounted = false; };
  }, [isAuthenticated]);

  const handleCreate = async () => {
    if (!isAuthenticated) return;
    try {
      const { data } = await axios.post('/api/goals', newGoal);
      setNewGoal({ title: '', description: '', steps: [] });
      setGoals((prev) => [data, ...prev]);
    } catch (error) {
      console.error('Failed to create goal', error);
    }
  };

  const toggleStep = async (goalId, stepIndex) => {
    if (!isAuthenticated) return;
    try {
      const { data } = await axios.patch(`/api/goals/${goalId}/step/${stepIndex}`, {});
      setGoals((prev) => prev.map((g) => (g._id === goalId ? data : g)));
    } catch (error) {
      console.error('Failed to toggle goal step', error);
    }
  };

  return (
    <div>
      <h2>Your Goals</h2>
      {goals.map((goal) => (
        <div key={goal._id}>
          <h3>{goal.title}</h3>
          <p>{goal.description}</p>
          <ul>
            {goal.steps.map((step, idx) => (
              <li key={idx}>
                <label>
                  <input
                    type="checkbox"
                    checked={step.completed}
                    onChange={() => toggleStep(goal._id, idx)}
                  />
                  {step.content}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="new-goal-box">
        <h3>Create Goal</h3>
        <input
          placeholder="Goal title"
          value={newGoal.title}
          onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
        />
        <textarea
          placeholder="Description"
          value={newGoal.description}
          onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
        />
        {/* Add simple step input for now */}
        <button onClick={handleCreate}>Save Goal</button>
      </div>
    </div>
  );
}

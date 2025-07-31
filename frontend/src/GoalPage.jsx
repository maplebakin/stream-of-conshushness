import { useState, useEffect, useContext } from 'react';
import axios from '../api/axiosInstance';
import { AuthContext } from '../AuthContext';

export default function GoalPage() {
  const { token } = useContext(AuthContext);
  const [goals, setGoals] = useState([]);
  const [newGoal, setNewGoal] = useState({ title: '', description: '', steps: [] });

  useEffect(() => {
    axios.get('/api/goals', {
      headers: { Authorization: `Bearer ${token}` }
    }).then((res) => setGoals(res.data));
  }, [token]);

  const handleCreate = async () => {
    await axios.post('/api/goals', newGoal, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setNewGoal({ title: '', description: '', steps: [] });
    const updated = await axios.get('/api/goals', {
      headers: { Authorization: `Bearer ${token}` }
    });
    setGoals(updated.data);
  };

  const toggleStep = async (goalId, stepIndex) => {
    const goal = goals.find(g => g._id === goalId);
    goal.steps[stepIndex].completed = !goal.steps[stepIndex].completed;
    await axios.put(`/api/goals/${goalId}`, goal, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setGoals([...goals]);
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

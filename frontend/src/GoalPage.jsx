import { useState, useEffect, useContext } from 'react';
import axios from './api/axiosInstance.js';
import { AuthContext } from './AuthContext.jsx';
import ConfirmButton from './components/ConfirmButton.jsx';

export default function GoalPage() {
  const { isAuthenticated } = useContext(AuthContext);
  const [goals, setGoals] = useState([]);
  const [newGoal, setNewGoal] = useState({ title: '', description: '', steps: [] });
  const [newGoalStep, setNewGoalStep] = useState('');
  const [stepDrafts, setStepDrafts] = useState({});
  const [editingGoalId, setEditingGoalId] = useState('');
  const [editDraft, setEditDraft] = useState({ title: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [createError, setCreateError] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      setGoals([]);
      setLoading(false);
      setLoadError('');
      return;
    }

    let isMounted = true;
    setLoading(true);
    setLoadError('');
    axios.get('/api/goals')
      .then((res) => { if (isMounted) setGoals(Array.isArray(res.data) ? res.data : []); })
      .catch((err) => {
        console.error('Failed to load goals', err);
        if (isMounted) {
          setGoals([]);
          setLoadError('Could not load goals. Try refreshing the page.');
        }
      })
      .finally(() => { if (isMounted) setLoading(false); });

    return () => { isMounted = false; };
  }, [isAuthenticated]);

  const handleCreate = async () => {
    if (!isAuthenticated) return;
    const title = newGoal.title.trim();
    const description = newGoal.description.trim();
    const firstStep = newGoalStep.trim();

    setCreateError('');
    setActionError('');

    if (!title) {
      setCreateError('Goal title is required.');
      return;
    }

    try {
      const { data } = await axios.post('/api/goals', {
        title,
        description,
        steps: firstStep ? [{ content: firstStep, completed: false }] : [],
      });
      setNewGoal({ title: '', description: '', steps: [] });
      setNewGoalStep('');
      setGoals((prev) => [data, ...prev]);
    } catch (error) {
      console.error('Failed to create goal', error);
      setCreateError('Could not create goal. Try again.');
    }
  };

  const toggleStep = async (goalId, stepIndex) => {
    if (!isAuthenticated) return;
    setActionError('');
    try {
      const { data } = await axios.patch(`/api/goals/${goalId}/step/${stepIndex}`, {});
      setGoals((prev) => prev.map((g) => (g._id === goalId ? data : g)));
    } catch (error) {
      console.error('Failed to toggle goal step', error);
      setActionError('Could not update goal step. Try again.');
    }
  };

  const startEdit = (goal) => {
    setActionError('');
    setEditingGoalId(goal._id);
    setEditDraft({
      title: goal.title || '',
      description: goal.description || '',
    });
  };

  const cancelEdit = () => {
    setEditingGoalId('');
    setEditDraft({ title: '', description: '' });
  };

  const saveGoalEdit = async (goalId) => {
    if (!isAuthenticated) return;
    const title = editDraft.title.trim();
    const description = editDraft.description.trim();
    setActionError('');

    if (!title) {
      setActionError('Goal title is required.');
      return;
    }

    try {
      const { data } = await axios.patch(`/api/goals/${goalId}`, { title, description });
      setGoals((prev) => prev.map((g) => (g._id === goalId ? data : g)));
      cancelEdit();
    } catch (error) {
      console.error('Failed to save goal', error);
      setActionError('Could not save goal. Try again.');
    }
  };

  const deleteGoal = async (goalId) => {
    if (!isAuthenticated) return;
    setActionError('');

    try {
      await axios.delete(`/api/goals/${goalId}`);
      setGoals((prev) => prev.filter((g) => g._id !== goalId));
      if (editingGoalId === goalId) cancelEdit();
    } catch (error) {
      console.error('Failed to delete goal', error);
      setActionError('Could not delete goal. Try again.');
    }
  };

  const addStep = async (goal) => {
    if (!isAuthenticated) return;
    const content = (stepDrafts[goal._id] || '').trim();
    setActionError('');

    if (!content) {
      setActionError('Step text is required.');
      return;
    }

    const steps = [
      ...(Array.isArray(goal.steps) ? goal.steps : []),
      { content, completed: false },
    ];

    try {
      const { data } = await axios.patch(`/api/goals/${goal._id}`, { steps });
      setGoals((prev) => prev.map((g) => (g._id === goal._id ? data : g)));
      setStepDrafts((prev) => ({ ...prev, [goal._id]: '' }));
    } catch (error) {
      console.error('Failed to add goal step', error);
      setActionError('Could not add goal step. Try again.');
    }
  };

  return (
    <div>
      <h2>Your Goals</h2>

      {loading && <p className="muted">Loading goals...</p>}
      {loadError && <p className="alert" role="alert">{loadError}</p>}
      {actionError && <p className="alert" role="alert">{actionError}</p>}
      {!loading && !loadError && goals.length === 0 && (
        <p className="muted">No goals yet. Add one to start shaping the thread.</p>
      )}

      {!loading && goals.map((goal) => (
        <div key={goal._id}>
          {editingGoalId === goal._id ? (
            <div>
              <input
                placeholder="Goal title"
                value={editDraft.title}
                onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
              />
              <textarea
                placeholder="Description"
                value={editDraft.description}
                onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
              />
              <div>
                <button type="button" onClick={() => saveGoalEdit(goal._id)}>Save Changes</button>
                <button type="button" onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <h3>{goal.title}</h3>
              {goal.description && <p>{goal.description}</p>}
              <div>
                <button type="button" onClick={() => startEdit(goal)}>Edit</button>
                <ConfirmButton onConfirm={() => deleteGoal(goal._id)} confirmLabel="Confirm Delete">
                  Delete
                </ConfirmButton>
              </div>
            </>
          )}
          <ul>
            {(goal.steps || []).map((step, idx) => (
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
          <div>
            <input
              placeholder="Add a step"
              value={stepDrafts[goal._id] || ''}
              onChange={(e) => setStepDrafts({ ...stepDrafts, [goal._id]: e.target.value })}
            />
            <button type="button" onClick={() => addStep(goal)}>Add Step</button>
          </div>
        </div>
      ))}

      <div className="new-goal-box">
        <h3>Create Goal</h3>
        {createError && <p className="alert" role="alert">{createError}</p>}
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
        <input
          placeholder="First step (optional)"
          value={newGoalStep}
          onChange={(e) => setNewGoalStep(e.target.value)}
        />
        <button type="button" onClick={handleCreate}>Save Goal</button>
      </div>
    </div>
  );
}

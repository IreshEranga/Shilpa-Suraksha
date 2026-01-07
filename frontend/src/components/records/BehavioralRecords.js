import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import './RecordsTab.css';

const BehavioralRecords = ({ studentId }) => {
  const [records, setRecords] = useState([]);
  const [formData, setFormData] = useState({
    observation_date: new Date().toISOString().split('T')[0],
    behavior_type: 'neutral',
    description: '',
    category: '',
    severity: 'medium'
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [mlAnalysis, setMlAnalysis] = useState(null);

  useEffect(() => {
    if (studentId) {
      fetchRecords();
    }
  }, [studentId]);

  const fetchRecords = async () => {
    try {
      setFetching(true);
      const res = await api.get(`/behavioral/student/${studentId}`);
      setRecords(res.data);
    } catch (error) {
      console.error('Error fetching behavioral records:', error);
      alert('Error loading behavioral records');
    } finally {
      setFetching(false);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyzeImage = async () => {
    if (!selectedImage) {
      alert('Please select an image first');
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', selectedImage);

      const response = await api.post('/ml/analyze-student-face', formData);

      const analysis = response.data;
      setMlAnalysis(analysis);

      // Auto-populate form fields based on ML analysis
      setFormData(prev => ({
        ...prev,
        behavior_type: analysis.behavior_type,
        severity: analysis.severity,
        category: analysis.category,
        description: analysis.description || prev.description
      }));

      const message = analysis.isFallback 
        ? `⚠️ FALLBACK MODE: Using basic color analysis.\nDetected emotion: ${analysis.emotion} (${(analysis.confidence * 100).toFixed(1)}% confidence).\n\n⚠️ Model not trained - results are approximate!\nTrain the model for accurate AI predictions.\n\nForm fields have been auto-filled.`
        : `Image analyzed! Detected emotion: ${analysis.emotion} (${(analysis.confidence * 100).toFixed(1)}% confidence). Form fields have been auto-filled.`;
      alert(message);
    } catch (error) {
      console.error('Error analyzing image:', error);
      
      // Handle model not trained error
      if (error.response?.status === 503 && error.response?.data?.requiresTraining) {
        alert(
          '⚠️ Model Not Trained Yet!\n\n' +
          'The emotion detection model needs to be trained first.\n\n' +
          'To train the model:\n' +
          '1. Open terminal/command prompt\n' +
          '2. Navigate to: cd server\n' +
          '3. Run: npm run train-models\n' +
          '4. Wait for training to complete (10-30 minutes)\n' +
          '5. Restart the server\n\n' +
          'After training, the AI will accurately detect emotions from student photos.'
        );
      } else {
        alert(error.response?.data?.error || error.response?.data?.message || 'Error analyzing image. Please try again.');
      }
    } finally {
      setUploadingImage(false);
    }
  };

  const handleClearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setMlAnalysis(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/teachers/behavioral-records', {
        student_id: studentId,
        ...formData
      });
      setFormData({
        observation_date: new Date().toISOString().split('T')[0],
        behavior_type: 'neutral',
        description: '',
        category: '',
        severity: 'medium'
      });
      setSelectedImage(null);
      setImagePreview(null);
      setMlAnalysis(null);
      fetchRecords();
      alert('Behavioral record added successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Error adding behavioral record');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="records-tab">
      <div className="card">
        <h3>Add Behavioral Record</h3>
        
        {/* AI Image Analysis Section */}
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px', border: '1px solid #ddd' }}>
          <h4 style={{ marginTop: 0, marginBottom: '10px', color: '#1976d2' }}>🤖 AI-Powered Emotion Detection</h4>
          <p style={{ marginBottom: '15px', fontSize: '14px', color: '#666' }}>
            Upload a student's photo to automatically detect emotions and populate the form fields.
          </p>
          
          <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Upload Student Photo
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                style={{ marginBottom: '10px', width: '100%' }}
                disabled={uploadingImage}
              />
              {imagePreview && (
                <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    style={{ maxWidth: '200px', maxHeight: '200px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                  <button
                    type="button"
                    onClick={handleClearImage}
                    style={{ 
                      display: 'block', 
                      marginTop: '5px', 
                      padding: '5px 10px', 
                      fontSize: '12px',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Remove Image
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={handleAnalyzeImage}
                disabled={!selectedImage || uploadingImage}
                style={{
                  padding: '10px 20px',
                  backgroundColor: uploadingImage ? '#ccc' : '#1976d2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: uploadingImage ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  width: '100%'
                }}
              >
                {uploadingImage ? 'Analyzing...' : '🔍 Analyze with AI'}
              </button>
            </div>
            
            {mlAnalysis && (
              <div style={{ 
                flex: '1', 
                minWidth: '200px', 
                padding: '15px', 
                backgroundColor: 'white', 
                borderRadius: '8px',
                border: mlAnalysis.isFallback ? '2px solid #ff9800' : '2px solid #4caf50'
              }}>
                <h5 style={{ marginTop: 0, color: mlAnalysis.isFallback ? '#ff9800' : '#4caf50' }}>
                  {mlAnalysis.isFallback ? '⚠️ Fallback Analysis (Model Not Trained)' : '✓ Analysis Results'}
                </h5>
                {mlAnalysis.isFallback && (
                  <div style={{ 
                    padding: '10px', 
                    backgroundColor: '#fff3cd', 
                    borderRadius: '4px', 
                    marginBottom: '10px',
                    fontSize: '12px',
                    color: '#856404',
                    border: '1px solid #ffc107'
                  }}>
                    <strong>⚠️ Warning:</strong> Using basic color analysis (fallback mode). 
                    Results are approximate. Train the model for accurate AI predictions.
                    <br />
                    <small>Run: <code>cd server && npm run train-models</code></small>
                  </div>
                )}
                <div style={{ fontSize: '14px' }}>
                  <p><strong>Emotion:</strong> <span style={{ textTransform: 'capitalize' }}>{mlAnalysis.emotion}</span></p>
                  <p><strong>Confidence:</strong> {(mlAnalysis.confidence * 100).toFixed(1)}%</p>
                  <p><strong>Behavior Type:</strong> <span style={{ textTransform: 'capitalize' }}>{mlAnalysis.behavior_type}</span></p>
                  <p><strong>Severity:</strong> <span style={{ textTransform: 'capitalize' }}>{mlAnalysis.severity}</span></p>
                  {mlAnalysis.category && (
                    <p><strong>Category:</strong> <span style={{ textTransform: 'capitalize' }}>{mlAnalysis.category.replace(/_/g, ' ')}</span></p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="record-form">
          <div className="form-row">
            <div className="form-group">
              <label>Observation Date *</label>
              <input
                type="date"
                className="input"
                value={formData.observation_date}
                onChange={(e) => setFormData({ ...formData, observation_date: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Behavior Type *</label>
              <select
                className="input"
                value={formData.behavior_type}
                onChange={(e) => setFormData({ ...formData, behavior_type: e.target.value })}
                required
              >
                <option value="positive">Positive</option>
                <option value="negative">Negative</option>
                <option value="neutral">Neutral</option>
              </select>
            </div>
            <div className="form-group">
              <label>Severity</label>
              <select
                className="input"
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Category</label>
            <input
              type="text"
              className="input"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="e.g., attention, participation, discipline"
            />
          </div>
          <div className="form-group">
            <label>Description *</label>
            <textarea
              className="input"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows="4"
              required
              placeholder="Describe the observed behavior..."
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Adding...' : 'Add Record'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Behavioral Records</h3>
        {fetching ? (
          <p>Loading records...</p>
        ) : records.length === 0 ? (
          <p className="no-data">No behavioral records found. Add a record above.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {records.map(record => (
                  <tr key={record.id}>
                    <td>{new Date(record.observation_date).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge badge-${record.behavior_type}`}>
                        {record.behavior_type.charAt(0).toUpperCase() + record.behavior_type.slice(1)}
                      </span>
                    </td>
                    <td>{record.category || '-'}</td>
                    <td>
                      <span className={`severity severity-${record.severity}`}>
                        {record.severity}
                      </span>
                    </td>
                    <td className="description-cell">{record.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BehavioralRecords;


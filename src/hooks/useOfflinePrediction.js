import { useState, useEffect } from 'react';
import * as ort from 'onnxruntime-web';

// Set the path to the WebAssembly binaries
ort.env.wasm.wasmPaths = '/';

export function useOfflinePrediction(modelPath) {
  const [session, setSession] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function loadModel() {
      try {
        // Loads the ONNX model from the public folder (served from PWA cache if offline)
        const mySession = await ort.InferenceSession.create(modelPath);
        setSession(mySession);
        setIsReady(true);
      } catch (e) {
        console.error(`Failed to load ONNX model from ${modelPath}:`, e);
      }
    }
    if (modelPath) {
      loadModel();
    }
  }, [modelPath]);

  const predict = async (featuresArray) => {
    if (!session) throw new Error("Model not loaded yet");

    try {
      // Create a tensor from the input features (Float32Array is required)
      const inputTensor = new ort.Tensor('float32', new Float32Array(featuresArray), [1, featuresArray.length]);
      
      // 'float_input' must match the name defined in the Python conversion script
      const feeds = { float_input: inputTensor };
      
      // Run inference locally
      const results = await session.run(feeds);
      
      // Extract the output
      // The output name depends on the model, usually 'variable' or 'output_label'
      const outputName = session.outputNames[0];
      const outputData = results[outputName].data;
      return outputData[0]; 
    } catch (e) {
      console.error("Prediction failed:", e);
      throw e;
    }
  };

  return { predict, isReady };
}

import { Sprout } from 'lucide-react'
import './LoadingScreen.css'

export default function LoadingScreen({ message = 'Preparing your dashboard...' }) {
    return (
        <div className="loading-screen">
            <div className="loading-content">
                {/* Animated farm scene */}
                <div className="loading-farm-scene">
                    <div className="loading-sun"></div>
                    <div className="loading-cloud cloud-1">☁️</div>
                    <div className="loading-cloud cloud-2">☁️</div>

                    <div className="loading-plant-container">
                        <div className="loading-plant">
                            <Sprout size={56} className="loading-sprout" />
                        </div>
                        <div className="loading-soil">
                            <span className="soil-dot"></span>
                            <span className="soil-dot"></span>
                            <span className="soil-dot"></span>
                        </div>
                    </div>

                    {/* Coffee beans floating */}
                    <div className="loading-bean bean-1">☕</div>
                    <div className="loading-bean bean-2">🌱</div>
                    <div className="loading-bean bean-3">🍃</div>
                </div>

                <div className="loading-brand">
                    <h1>IKAPE</h1>
                    <p>Coffee Farm Management System</p>
                </div>

                <div className="loading-bar-container">
                    <div className="loading-bar"></div>
                </div>

                <p className="loading-message">{message}</p>
            </div>
        </div>
    )
}

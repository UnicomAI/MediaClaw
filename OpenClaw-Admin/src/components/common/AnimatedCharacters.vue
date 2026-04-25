<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'

interface Props {
  isTyping?: boolean
  showPassword?: boolean
  passwordLength?: number
}

const props = withDefaults(defineProps<Props>(), {
  isTyping: false,
  showPassword: false,
  passwordLength: 0
})

const mouseX = ref(0)
const mouseY = ref(0)
const isPurpleBlinking = ref(false)
const isBlackBlinking = ref(false)
const isLookingAtEachOther = ref(false)
const isPurplePeeking = ref(false)

const purpleRef = ref<HTMLElement | null>(null)
const blackRef = ref<HTMLElement | null>(null)
const yellowRef = ref<HTMLElement | null>(null)
const orangeRef = ref<HTMLElement | null>(null)

onMounted(() => {
  const handleMouseMove = (e: MouseEvent) => {
    mouseX.value = e.clientX
    mouseY.value = e.clientY
  }
  window.addEventListener('mousemove', handleMouseMove)
  
  onUnmounted(() => {
    window.removeEventListener('mousemove', handleMouseMove)
  })
})

const schedulePurpleBlink = () => {
  const getRandomBlinkInterval = () => Math.random() * 4000 + 3000
  let timeout: number
  
  const schedule = () => {
    timeout = window.setTimeout(() => {
      isPurpleBlinking.value = true
      setTimeout(() => {
        isPurpleBlinking.value = false
        schedule()
      }, 150)
    }, getRandomBlinkInterval())
  }
  
  schedule()
  return () => clearTimeout(timeout)
}

const scheduleBlackBlink = () => {
  const getRandomBlinkInterval = () => Math.random() * 4000 + 3000
  let timeout: number
  
  const schedule = () => {
    timeout = window.setTimeout(() => {
      isBlackBlinking.value = true
      setTimeout(() => {
        isBlackBlinking.value = false
        schedule()
      }, 150)
    }, getRandomBlinkInterval())
  }
  
  schedule()
  return () => clearTimeout(timeout)
}

let purpleBlinkCleanup: (() => void) | null = null
let blackBlinkCleanup: (() => void) | null = null

onMounted(() => {
  purpleBlinkCleanup = schedulePurpleBlink()
  blackBlinkCleanup = scheduleBlackBlink()
})

onUnmounted(() => {
  purpleBlinkCleanup?.()
  blackBlinkCleanup?.()
})

watch(() => props.isTyping, (newVal) => {
  if (newVal) {
    isLookingAtEachOther.value = true
    setTimeout(() => {
      isLookingAtEachOther.value = false
    }, 800)
  } else {
    isLookingAtEachOther.value = false
  }
})

watch([() => props.passwordLength, () => props.showPassword, isPurplePeeking], ([len, show, peeking]) => {
  if (len > 0 && show && !peeking) {
    const schedulePeek = () => {
      const peekInterval = window.setTimeout(() => {
        isPurplePeeking.value = true
        setTimeout(() => {
          isPurplePeeking.value = false
        }, 800)
      }, Math.random() * 3000 + 2000)
      return peekInterval
    }
    const firstPeek = schedulePeek()
    return () => clearTimeout(firstPeek)
  } else if (!(len > 0 && show)) {
    isPurplePeeking.value = false
  }
})

const isHidingPassword = computed(() => props.passwordLength > 0 && !props.showPassword)

const calculatePosition = (el: HTMLElement | null) => {
  if (!el) return { faceX: 0, faceY: 0, bodySkew: 0 }
  
  const rect = el.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 3
  
  const deltaX = mouseX.value - centerX
  const deltaY = mouseY.value - centerY
  
  const faceX = Math.max(-15, Math.min(15, deltaX / 20))
  const faceY = Math.max(-10, Math.min(10, deltaY / 30))
  const bodySkew = Math.max(-6, Math.min(6, -deltaX / 120))
  
  return { faceX, faceY, bodySkew }
}

const purplePos = computed(() => calculatePosition(purpleRef.value))
const blackPos = computed(() => calculatePosition(blackRef.value))
const yellowPos = computed(() => calculatePosition(yellowRef.value))
const orangePos = computed(() => calculatePosition(orangeRef.value))
</script>

<template>
  <div class="animated-characters">
    <div 
      ref="purpleRef"
      class="character purple"
      :style="{
        transform: (passwordLength > 0 && showPassword)
          ? 'skewX(0deg)'
          : (isTyping || isHidingPassword)
            ? `skewX(${(purplePos.bodySkew || 0) - 12}deg) translateX(40px)`
            : `skewX(${purplePos.bodySkew || 0}deg)`
      }"
    >
      <div 
        class="eyes"
        :style="{
          left: (passwordLength > 0 && showPassword) ? '20px' : isLookingAtEachOther ? '55px' : `${45 + purplePos.faceX}px`,
          top: (passwordLength > 0 && showPassword) ? '35px' : isLookingAtEachOther ? '65px' : `${40 + purplePos.faceY}px`
        }"
      >
        <div 
          class="eye"
          :class="{ blinking: isPurpleBlinking }"
          :style="{
            transform: (passwordLength > 0 && showPassword)
              ? `translate(${isPurplePeeking ? 4 : -4}px, ${isPurplePeeking ? 5 : -4}px)`
              : isLookingAtEachOther
                ? 'translate(3px, 4px)'
                : 'none'
          }"
        >
          <div 
            class="pupil"
            :style="{
              transform: (passwordLength > 0 && showPassword)
                ? `translate(${isPurplePeeking ? 4 : -4}px, ${isPurplePeeking ? 5 : -4}px)`
                : 'none'
            }"
          />
        </div>
        <div 
          class="eye"
          :class="{ blinking: isPurpleBlinking }"
          :style="{
            transform: (passwordLength > 0 && showPassword)
              ? `translate(${isPurplePeeking ? 4 : -4}px, ${isPurplePeeking ? 5 : -4}px)`
              : isLookingAtEachOther
                ? 'translate(3px, 4px)'
                : 'none'
          }"
        >
          <div 
            class="pupil"
            :style="{
              transform: (passwordLength > 0 && showPassword)
                ? `translate(${isPurplePeeking ? 4 : -4}px, ${isPurplePeeking ? 5 : -4}px)`
                : 'none'
            }"
          />
        </div>
      </div>
    </div>

    <div 
      ref="blackRef"
      class="character black"
      :style="{
        transform: (passwordLength > 0 && showPassword)
          ? 'skewX(0deg)'
          : isLookingAtEachOther
            ? `skewX(${(blackPos.bodySkew || 0) * 1.5 + 10}deg) translateX(20px)`
            : (isTyping || isHidingPassword)
              ? `skewX(${(blackPos.bodySkew || 0) * 1.5}deg)`
              : `skewX(${blackPos.bodySkew || 0}deg)`
      }"
    >
      <div 
        class="eyes"
        :style="{
          left: (passwordLength > 0 && showPassword) ? '10px' : isLookingAtEachOther ? '32px' : `${26 + blackPos.faceX}px`,
          top: (passwordLength > 0 && showPassword) ? '28px' : isLookingAtEachOther ? '12px' : `${32 + blackPos.faceY}px`
        }"
      >
        <div 
          class="eye"
          :class="{ blinking: isBlackBlinking }"
          :style="{
            transform: (passwordLength > 0 && showPassword)
              ? 'translate(-4px, -4px)'
              : isLookingAtEachOther
                ? 'translate(0, -4px)'
                : 'none'
          }"
        >
          <div 
            class="pupil"
            :style="{
              transform: (passwordLength > 0 && showPassword)
                ? 'translate(-4px, -4px)'
                : 'none'
            }"
          />
        </div>
        <div 
          class="eye"
          :class="{ blinking: isBlackBlinking }"
          :style="{
            transform: (passwordLength > 0 && showPassword)
              ? 'translate(-4px, -4px)'
              : isLookingAtEachOther
                ? 'translate(0, -4px)'
                : 'none'
          }"
        >
          <div 
            class="pupil"
            :style="{
              transform: (passwordLength > 0 && showPassword)
                ? 'translate(-4px, -4px)'
                : 'none'
            }"
          />
        </div>
      </div>
    </div>

    <div 
      ref="orangeRef"
      class="character orange"
      :style="{
        transform: (passwordLength > 0 && showPassword)
          ? 'skewX(0deg)'
          : `skewX(${orangePos.bodySkew || 0}deg)`
      }"
    >
      <div 
        class="pupils-only"
        :style="{
          left: (passwordLength > 0 && showPassword) ? '50px' : `${82 + (orangePos.faceX || 0)}px`,
          top: (passwordLength > 0 && showPassword) ? '85px' : `${90 + (orangePos.faceY || 0)}px`
        }"
      >
        <div 
          class="pupil-only"
          :style="{
            transform: (passwordLength > 0 && showPassword)
              ? 'translate(-5px, -4px)'
              : 'none'
          }"
        />
        <div 
          class="pupil-only"
          :style="{
            transform: (passwordLength > 0 && showPassword)
              ? 'translate(-5px, -4px)'
              : 'none'
          }"
        />
      </div>
    </div>

    <div 
      ref="yellowRef"
      class="character yellow"
      :style="{
        transform: (passwordLength > 0 && showPassword)
          ? 'skewX(0deg)'
          : `skewX(${yellowPos.bodySkew || 0}deg)`
      }"
    >
      <div 
        class="pupils-only"
        :style="{
          left: (passwordLength > 0 && showPassword) ? '20px' : `${52 + (yellowPos.faceX || 0)}px`,
          top: (passwordLength > 0 && showPassword) ? '35px' : `${40 + (yellowPos.faceY || 0)}px`
        }"
      >
        <div 
          class="pupil-only"
          :style="{
            transform: (passwordLength > 0 && showPassword)
              ? 'translate(-5px, -4px)'
              : 'none'
          }"
        />
        <div 
          class="pupil-only"
          :style="{
            transform: (passwordLength > 0 && showPassword)
              ? 'translate(-5px, -4px)'
              : 'none'
          }"
        />
      </div>
      <div 
        class="mouth"
        :style="{
          left: (passwordLength > 0 && showPassword) ? '10px' : `${60 + (yellowPos.faceX || 0)}px`,
          top: (passwordLength > 0 && showPassword) ? '88px' : `${88 + (yellowPos.faceY || 0)}px`
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.animated-characters {
  position: relative;
  width: 550px;
  height: 400px;
}

.character {
  position: absolute;
  bottom: 0;
  transition: all 0.7s ease-in-out;
  transform-origin: bottom center;
}

.purple {
  left: 70px;
  width: 180px;
  height: v-bind('(isTyping || isHidingPassword) ? "444px" : "400px"');
  background-color: #6C3FF5;
  border-radius: 10px 10px 0 0;
  z-index: 1;
}

.black {
  left: 240px;
  width: 120px;
  height: 310px;
  background-color: #2D2D2D;
  border-radius: 8px 8px 0 0;
  z-index: 2;
}

.orange {
  left: 0px;
  width: 240px;
  height: 200px;
  z-index: 3;
  background-color: #FF9B6B;
  border-radius: 120px 120px 0 0;
}

.yellow {
  left: 310px;
  width: 140px;
  height: 230px;
  background-color: #E8D754;
  border-radius: 70px 70px 0 0;
  z-index: 4;
}

.eyes {
  position: absolute;
  display: flex;
  gap: 8px;
  transition: all 0.7s ease-in-out;
}

.eye {
  width: 18px;
  height: v-bind('isPurpleBlinking || isBlackBlinking ? "2px" : "18px"');
  background-color: white;
  border-radius: 50%;
  overflow: hidden;
  transition: all 0.15s ease-in-out;
  display: flex;
  align-items: center;
  justify-content: center;
}

.eye.blinking {
  height: 2px;
}

.pupil {
  width: 7px;
  height: 7px;
  background-color: #2D2D2D;
  border-radius: 50%;
  transition: transform 0.1s ease-out;
}

.pupils-only {
  position: absolute;
  display: flex;
  gap: 8px;
  transition: all 0.2s ease-out;
}

.pupil-only {
  width: 12px;
  height: 12px;
  background-color: #2D2D2D;
  border-radius: 50%;
  transition: transform 0.1s ease-out;
}

.mouth {
  position: absolute;
  width: 20px;
  height: 4px;
  background-color: #2D2D2D;
  border-radius: 2px;
  transition: all 0.2s ease-out;
}
</style>

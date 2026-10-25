<template>
  <img class="mobile-orbit" :src="orbit" alt="" aria-hidden="true" width="512" height="512" decoding="async" />
</template>
<script setup lang="ts">
import orbit from '../assets/learning-orbit.webp'
</script>
<style scoped>
.mobile-orbit { display: block; width: 100%; height: auto; object-fit: contain; pointer-events: none; user-select: none; }
</style>
